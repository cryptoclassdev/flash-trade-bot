import axios, { AxiosInstance } from "axios";
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
  ComputeBudgetProgram,
  AddressLookupTableAccount,
  TransactionInstruction,
  Signer,
} from "@solana/web3.js";
import { AppConfig } from "./config";
import {
  FlashBackend,
  Side,
  OpenResult,
  CloseResult,
  FlipResult,
  PositionView,
} from "./types";

// --------------------------- shared utils ---------------------------

export function pickBackend(cfg: AppConfig): FlashBackend {
  return cfg.network === "mainnet-beta" ? new ApiBackend(cfg) : new SdkBackend(cfg);
}

function sideToTradeType(side: Side): "LONG" | "SHORT" {
  return side === "long" ? "LONG" : "SHORT";
}

// Anchor serializes tagged enums as { long: {} } / { short: {} }. Normalize.
function sideKeyOf(side: any): "long" | "short" | "none" {
  if (side && typeof side === "object") {
    if ("long" in side) return "long";
    if ("short" in side) return "short";
  }
  if (side === "long" || side === "short") return side;
  return "none";
}

function deserializeAndSign(b64: string, signers: Keypair[]): VersionedTransaction {
  const buf = Buffer.from(b64, "base64");
  const tx = VersionedTransaction.deserialize(buf);
  tx.sign(signers);
  return tx;
}

async function sendRaw(conn: Connection, tx: VersionedTransaction, priorityMicroLamports?: number): Promise<string> {
  // Priority fee bumping is the caller's job (retry.ts) — they rebuild the tx.
  // Here we just broadcast.
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 0,
    preflightCommitment: "confirmed",
  });
  return sig;
}

// --------------------------- API backend (mainnet) ---------------------------

class ApiBackend implements FlashBackend {
  private cfg: AppConfig;
  private conn: Connection | null;
  private http: AxiosInstance;

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    // Dry-run doesn't need an RPC connection (no sending) — and rpcUrl is empty in that mode.
    this.conn = cfg.dryRunOnly ? null : new Connection(cfg.rpcUrl, "confirmed");
    this.http = axios.create({
      baseURL: cfg.flashApiBaseUrl,
      timeout: 15000,
      headers: { "Content-Type": "application/json" },
    });
  }

  /** Safety guard: called before every sign/send. Throws if dry-run or no wallet loaded. */
  private requireLiveWallet(where: string): Keypair {
    if (this.cfg.dryRunOnly) {
      throw new Error(`[safety] ${where}: DRY_RUN_ONLY=true — refusing to sign/send`);
    }
    if (!this.cfg.walletKeypair) {
      throw new Error(`[safety] ${where}: wallet keypair not loaded`);
    }
    if (!this.conn) {
      throw new Error(`[safety] ${where}: RPC connection not initialized`);
    }
    return this.cfg.walletKeypair;
  }

  private throwIfErr(resp: any, where: string): void {
    if (resp?.err !== null && resp?.err !== undefined) {
      throw new Error(`flash API ${where} returned err: ${resp.err}`);
    }
  }

  async openPosition(args: {
    side: Side;
    collateralUsdc: number;
    leverage: number;
    slippagePct: string;
  }): Promise<OpenResult> {
    const body = {
      inputTokenSymbol: "USDC",
      outputTokenSymbol: this.cfg.asset,
      inputAmountUi: args.collateralUsdc.toString(),
      leverage: args.leverage,
      tradeType: sideToTradeType(args.side),
      slippagePercentage: args.slippagePct,
      owner: this.cfg.walletPubkey,
      privilege: "NONE",
    };
    const { data } = await this.http.post("/transaction-builder/open-position", body);

    if (this.cfg.dryRunOnly) {
      // Short-circuit: no signing, no broadcasting. Return the raw API response for inspection.
      return {
        txSig: "DRYRUN_NOT_SUBMITTED",
        fillPrice: data.newEntryPrice !== undefined ? Number(data.newEntryPrice) : undefined,
        raw: data,
      };
    }

    this.throwIfErr(data, "open-position");
    if (!data.transactionBase64) throw new Error("open-position: missing transactionBase64");

    const kp = this.requireLiveWallet("openPosition");
    const tx = deserializeAndSign(data.transactionBase64, [kp]);
    const txSig = await sendRaw(this.conn!, tx);

    return {
      txSig,
      fillPrice: data.newEntryPrice ? Number(data.newEntryPrice) : undefined,
    };
  }

  async closePosition(args: { positionKey: string; side: Side; slippagePct: string }): Promise<CloseResult> {
    let inputUsdUi: string;
    if (this.cfg.dryRunOnly) {
      // Dry-run: skip the on-chain pre-check; let the API respond to the request as-is.
      inputUsdUi = "10";
    } else {
      const positions = await this.getUserPositions();
      const target = positions.find((p) => p.positionKey === args.positionKey);
      if (!target) throw new Error(`closePosition: position ${args.positionKey} not found on chain`);
      inputUsdUi = target.sizeUsd?.toString() ?? "0";
    }

    const body = {
      positionKey: args.positionKey,
      inputUsdUi,
      withdrawTokenSymbol: "USDC",
      slippagePercentage: args.slippagePct,
      privilege: "NONE",
    };
    const { data } = await this.http.post("/transaction-builder/close-position", body);

    if (this.cfg.dryRunOnly) {
      return {
        txSig: "DRYRUN_NOT_SUBMITTED",
        realizedPnlUsd: data.settledPnl !== undefined ? Number(data.settledPnl) : undefined,
        fillPrice: data.markPrice !== undefined ? Number(data.markPrice) : undefined,
        raw: data,
      };
    }

    this.throwIfErr(data, "close-position");
    if (!data.transactionBase64) throw new Error("close-position: missing transactionBase64");

    const kp = this.requireLiveWallet("closePosition");
    const tx = deserializeAndSign(data.transactionBase64, [kp]);
    const txSig = await sendRaw(this.conn!, tx);

    return {
      txSig,
      realizedPnlUsd: data.settledPnl !== undefined ? Number(data.settledPnl) : undefined,
      fillPrice: data.markPrice !== undefined ? Number(data.markPrice) : undefined,
    };
  }

  async flipPosition(args: {
    positionKey: string;
    fromSide: Side;
    toSide: Side;
    slippagePct: string;
  }): Promise<FlipResult> {
    const body = {
      positionKey: args.positionKey,
      owner: this.cfg.walletPubkey,
      slippagePercentage: args.slippagePct,
      privilege: "NONE",
    };
    const { data } = await this.http.post("/transaction-builder/reverse-position", body);

    if (this.cfg.dryRunOnly) {
      return { txSig: "DRYRUN_NOT_SUBMITTED", raw: data };
    }

    this.throwIfErr(data, "reverse-position");
    if (!data.transactionBase64) throw new Error("reverse-position: missing transactionBase64");

    const kp = this.requireLiveWallet("flipPosition");
    const tx = deserializeAndSign(data.transactionBase64, [kp]);
    const txSig = await sendRaw(this.conn!, tx);
    return { txSig };
  }

  async getUserPositions(): Promise<PositionView[]> {
    const { data } = await this.http.get(
      `/positions/owner/${this.cfg.walletPubkey}`,
      { params: { includePnlInLeverageDisplay: "true" } }
    );
    if (!Array.isArray(data)) return [];
    return data.map((p: any) => ({
      positionKey: p.key,
      side: (String(p.sideUi || "").toLowerCase() === "short" ? "short" : "long") as Side,
      sizeUsd: Number(p.sizeUsdUi ?? 0),
      collateralUsd: Number(p.collateralUsdUi ?? 0),
      entryPrice: Number(p.entryPriceUi ?? 0),
      marketSymbol: String(p.marketSymbol ?? ""),
    }));
  }

  private async findOpenedPositionKey(side: Side): Promise<string> {
    // After a successful open we look up the position. Match on asset + side.
    // confirm.ts will retry this if it doesn't appear immediately.
    const positions = await this.getUserPositions();
    const match = positions.find(
      (p) => p.side === side && p.marketSymbol.toUpperCase().includes(this.cfg.asset.toUpperCase())
    );
    if (!match) throw new Error(`findOpenedPositionKey: no ${side} ${this.cfg.asset} position found post-open`);
    return match.positionKey;
  }
}

// --------------------------- SDK backend (devnet) ---------------------------
//
// Devnet is not exposed by the HTTP API, so we drive the chain directly via
// flash-sdk. Modeled on flash-trade-sdk/examples/src/trade.ts.

class SdkBackend implements FlashBackend {
  private cfg: AppConfig;
  private conn: Connection;
  // Lazy-init the SDK client because the import has side effects.
  private clientPromise: Promise<any> | null = null;

  constructor(cfg: AppConfig) {
    if (cfg.dryRunOnly) {
      throw new Error("SdkBackend does not support DRY_RUN_ONLY; use NETWORK=mainnet-beta with ApiBackend");
    }
    if (!cfg.walletKeypair) {
      throw new Error("SdkBackend requires a loaded wallet keypair");
    }
    this.cfg = cfg;
    this.conn = new Connection(cfg.rpcUrl, "confirmed");
  }

  private async client(): Promise<{
    flashClient: any;
    POOL_CONFIG: any;
    Side: any;
    Privilege: any;
    OraclePrice: any;
    CustodyAccount: any;
    PoolAccount: any;
    PoolDataClient: any;
    BN: any;
    BN_ZERO: any;
    uiDecimalsToNative: any;
    pythClient: any;
  }> {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      const sdk = await import("flash-sdk");
      const anchor = await import("@coral-xyz/anchor");
      const NodeWalletMod = await import("@coral-xyz/anchor/dist/cjs/nodewallet");
      const NodeWallet = (NodeWalletMod as any).default || NodeWalletMod;
      const pyth = await import("@pythnetwork/client");

      const POOL_CONFIG = sdk.PoolConfig.fromIdsByName("devnet.1", "devnet" as any);
      const wallet = new NodeWallet(this.cfg.walletKeypair! as any);
      const provider = new anchor.AnchorProvider(this.conn as any, wallet, {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
        skipPreflight: false,
      });
      const flashClient = new sdk.PerpetualsClient(
        provider as any,
        POOL_CONFIG.programId,
        POOL_CONFIG.perpComposibilityProgramId,
        POOL_CONFIG.fbNftRewardProgramId,
        POOL_CONFIG.rewardDistributionProgram.programId,
        { prioritizationFee: 0 }
      );
      const pythConn = new Connection(this.cfg.pythnetUrl);
      const pythClient = new pyth.PythHttpClient(pythConn, pyth.getPythProgramKeyForCluster("pythnet"));

      return {
        flashClient,
        POOL_CONFIG,
        Side: sdk.Side,
        Privilege: sdk.Privilege,
        OraclePrice: sdk.OraclePrice,
        CustodyAccount: sdk.CustodyAccount,
        PoolAccount: sdk.PoolAccount,
        PoolDataClient: sdk.PoolDataClient,
        BN: anchor.BN,
        BN_ZERO: sdk.BN_ZERO,
        uiDecimalsToNative: sdk.uiDecimalsToNative,
        pythClient,
      };
    })();
    return this.clientPromise;
  }

  private async getPriceMap(): Promise<Map<string, { price: any; emaPrice: any }>> {
    const { POOL_CONFIG, OraclePrice, BN, pythClient } = await this.client();
    const result = await pythClient.getData();
    const map = new Map<string, { price: any; emaPrice: any }>();
    for (const token of POOL_CONFIG.tokens) {
      const pd = result.productPrice.get(token.pythTicker);
      if (!pd) throw new Error(`pyth price not found for ${token.symbol}`);
      const price = new OraclePrice({
        price: new BN(pd.aggregate.priceComponent.toString()),
        exponent: new BN(pd.exponent),
        confidence: new BN(pd.confidence),
        timestamp: new BN(pd.timestamp.toString()),
      });
      const emaPrice = new OraclePrice({
        price: new BN(pd.emaPrice.valueComponent.toString()),
        exponent: new BN(pd.exponent),
        confidence: new BN(pd.emaConfidence.valueComponent.toString()),
        timestamp: new BN(pd.timestamp.toString()),
      });
      map.set(token.symbol, { price, emaPrice });
    }
    return map;
  }

  private async sendIxs(
    instructions: TransactionInstruction[],
    additionalSigners: Signer[],
    priorityMicroLamports?: number
  ): Promise<string> {
    const { flashClient, POOL_CONFIG } = await this.client();
    const cuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 });
    const cuPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityMicroLamports ?? 50,
    });
    if (!flashClient.addressLookupTables || flashClient.addressLookupTables.length === 0) {
      await flashClient.loadAddressLookupTable(POOL_CONFIG);
    }
    const alts: AddressLookupTableAccount[] = flashClient.addressLookupTables ?? [];
    const sig: string = await flashClient.sendTransaction(
      [cuLimitIx, cuPriceIx, ...instructions],
      { alts, additionalSigners }
    );
    return sig;
  }

  async openPosition(args: {
    side: Side;
    collateralUsdc: number;
    leverage: number;
    slippagePct: string;
  }): Promise<OpenResult> {
    const {
      flashClient, POOL_CONFIG, Side: SdkSide, Privilege, BN, BN_ZERO,
      uiDecimalsToNative, CustodyAccount, PoolAccount, PoolDataClient,
    } = await this.client();
    const { getMint } = await import("@solana/spl-token");

    const inputToken = POOL_CONFIG.tokens.find((t: any) => t.symbol === "USDC");
    const targetToken = POOL_CONFIG.tokens.find((t: any) => t.symbol === this.cfg.asset);
    if (!inputToken) throw new Error(`USDC token not found in devnet.1`);
    if (!targetToken) throw new Error(`${this.cfg.asset} token not found in devnet.1`);

    const sdkSide = args.side === "long" ? SdkSide.Long : SdkSide.Short;
    const slippageBps = Math.round(parseFloat(args.slippagePct) * 100);

    // On devnet.1 the BTC long market uses BTC collateral; BTC short uses USDC collateral.
    // Look the market up so we pick the right collateral symbol and flow.
    const market = POOL_CONFIG.markets.find(
      (m: any) => m.targetMint.equals(targetToken.mintKey) && sideKeyOf(m.side) === args.side
    );
    if (!market) {
      throw new Error(`No ${args.side} market for ${targetToken.symbol} on ${POOL_CONFIG.poolName}`);
    }
    const collateralToken = POOL_CONFIG.tokens.find((t: any) => t.mintKey.equals(market.collateralMint));
    if (!collateralToken) throw new Error(`collateralToken not found for market ${market.marketAccount?.toBase58?.()}`);

    const priceMap = await this.getPriceMap();
    const inputPrice = priceMap.get(inputToken.symbol)!.price;
    const inputPriceEma = priceMap.get(inputToken.symbol)!.emaPrice;
    const targetPrice = priceMap.get(targetToken.symbol)!.price;
    const targetPriceEma = priceMap.get(targetToken.symbol)!.emaPrice;
    const collateralPrice = priceMap.get(collateralToken.symbol)!.price;
    const collateralPriceEma = priceMap.get(collateralToken.symbol)!.emaPrice;

    const priceAfterSlippage = flashClient.getPriceAfterSlippage(
      true, new BN(slippageBps), targetPrice, sdkSide
    );
    const collateralWithFee = uiDecimalsToNative(args.collateralUsdc.toString(), inputToken.decimals);

    const inputCustody = POOL_CONFIG.custodies.find((c: any) => c.symbol === inputToken.symbol)!;
    const targetCustody = POOL_CONFIG.custodies.find((c: any) => c.symbol === targetToken.symbol)!;
    const collateralCustody = POOL_CONFIG.custodies.find((c: any) => c.symbol === collateralToken.symbol)!;
    if (!inputCustody || !targetCustody || !collateralCustody) {
      throw new Error("one of {input, target, collateral} custodies missing on devnet.1");
    }

    const customKeys: any[] = [inputCustody.custodyAccount, collateralCustody.custodyAccount, targetCustody.custodyAccount];
    const custodyAccs = await flashClient.program.account.custody.fetchMultiple(customKeys);
    if (custodyAccs.some((c: any) => !c)) {
      throw new Error(`custody fetchMultiple returned null for one of input/collateral/target`);
    }
    const inputCustodyAcc = CustodyAccount.from(inputCustody.custodyAccount, custodyAccs[0]);
    const collateralCustodyAcc = CustodyAccount.from(collateralCustody.custodyAccount, custodyAccs[1]);
    const targetCustodyAcc = CustodyAccount.from(targetCustody.custodyAccount, custodyAccs[2]);

    const needsSwap = !inputCustody.custodyAccount.equals(collateralCustody.custodyAccount);

    let txSig: string;
    if (needsSwap) {
      // USDC -> BTC collateral path (long)
      const poolAccount = PoolAccount.from(
        POOL_CONFIG.poolAddress,
        await flashClient.program.account.pool.fetch(POOL_CONFIG.poolAddress)
      );
      const allCustodies = await flashClient.program.account.custody.all();
      const lpMintData = await getMint(this.conn, POOL_CONFIG.stakedLpTokenMint);
      const poolDataClient = new PoolDataClient(
        POOL_CONFIG, poolAccount, lpMintData,
        allCustodies.map((c: any) => CustodyAccount.from(c.publicKey, c.account))
      );
      const lpStats = poolDataClient.getLpStats(priceMap);

      const size = flashClient.getSizeAmountWithSwapSync(
        collateralWithFee,
        args.leverage.toString(),
        sdkSide,
        poolAccount,
        inputPrice, inputPriceEma, inputCustodyAcc,
        collateralPrice, collateralPriceEma, collateralCustodyAcc,
        collateralPrice, collateralPriceEma, collateralCustodyAcc,  // swapOut === collateral
        targetPrice, targetPriceEma, targetCustodyAcc,
        lpStats.totalPoolValueUsd,
        POOL_CONFIG, BN_ZERO
      );

      const built = await flashClient.swapAndOpen(
        targetToken.symbol,       // target
        collateralToken.symbol,   // collateral
        inputToken.symbol,        // userInput (USDC)
        collateralWithFee,        // amountIn (USDC native)
        BN_ZERO,                  // minCollateralAmountOut — not enforced; position-price slippage still protects
        priceAfterSlippage,       // priceWithSlippage
        size,                     // sizeAmount
        sdkSide,                  // side
        POOL_CONFIG,
        Privilege.None
      );
      txSig = await this.sendIxs(built.instructions, built.additionalSigners);
    } else {
      // USDC collateral path (short) — no swap; direct open.
      const size = flashClient.getSizeAmountFromLeverageAndCollateral(
        collateralWithFee,
        args.leverage.toString(),
        targetToken,        // marketToken
        collateralToken,    // collateralToken
        sdkSide,
        targetPrice, targetPriceEma, targetCustodyAcc,
        collateralPrice, collateralPriceEma, collateralCustodyAcc,
        BN_ZERO
      );
      const built = await flashClient.openPosition(
        targetToken.symbol,
        collateralToken.symbol,
        priceAfterSlippage,
        collateralWithFee,
        size,
        sdkSide,
        POOL_CONFIG,
        Privilege.None
      );
      txSig = await this.sendIxs(built.instructions, built.additionalSigners);
    }

    // Position-key discovery happens in confirm.ts AFTER tx confirmation.
    return { txSig };
  }

  async closePosition(args: { positionKey: string; side: Side; slippagePct: string }): Promise<CloseResult> {
    const { flashClient, POOL_CONFIG, Side: SdkSide, Privilege, BN, BN_ZERO } = await this.client();

    const sdkSide = args.side === "long" ? SdkSide.Long : SdkSide.Short;
    const slippageBps = Math.round(parseFloat(args.slippagePct) * 100);

    const positions = await flashClient.getUserPositions(this.cfg.walletKeypair!.publicKey, POOL_CONFIG);
    const pos = positions.find((p: any) => p.pubkey.toBase58() === args.positionKey);
    if (!pos) throw new Error(`closePosition: ${args.positionKey} not found on chain`);

    const market = POOL_CONFIG.markets.find((m: any) => m.marketAccount.equals(pos.market))!;
    const targetToken = POOL_CONFIG.tokens.find((t: any) => t.mintKey.equals(market.targetMint))!;
    const collateralToken = POOL_CONFIG.tokens.find((t: any) => t.mintKey.equals(market.collateralMint))!;
    const usdcToken = POOL_CONFIG.tokens.find((t: any) => t.symbol === "USDC")!;

    const priceMap = await this.getPriceMap();
    const targetPrice = priceMap.get(targetToken.symbol)!.price;
    const priceAfterSlippage = flashClient.getPriceAfterSlippage(
      false, new BN(slippageBps), targetPrice, sdkSide
    );

    let txSig: string;
    const collateralIsUsdc = collateralToken.mintKey.equals(usdcToken.mintKey);
    if (collateralIsUsdc) {
      // Direct close → receives USDC.
      const built = await flashClient.closePosition(
        targetToken.symbol, collateralToken.symbol, priceAfterSlippage,
        sdkSide, POOL_CONFIG, Privilege.None
      );
      txSig = await this.sendIxs(built.instructions, built.additionalSigners);
    } else {
      // Close + swap collateral back to USDC for the user.
      const built = await flashClient.closeAndSwap(
        targetToken.symbol,   // target
        usdcToken.symbol,     // userOutput (USDC)
        collateralToken.symbol,  // collateral (BTC for long on devnet.1)
        BN_ZERO,              // minSwapAmountOut — not enforced; position-price slippage still protects
        priceAfterSlippage,
        sdkSide,
        POOL_CONFIG,
        Privilege.None
      );
      txSig = await this.sendIxs(built.instructions, built.additionalSigners);
    }
    return { txSig };
  }

  async flipPosition(args: {
    positionKey: string;
    fromSide: Side;
    toSide: Side;
    slippagePct: string;
  }): Promise<FlipResult> {
    // SDK has no atomic reverse — close, then open. Caller (executor) must handle
    // the partial-failure window (close ok, open fails).
    await this.closePosition({ positionKey: args.positionKey, side: args.fromSide, slippagePct: args.slippagePct });
    const opened = await this.openPosition({
      side: args.toSide,
      collateralUsdc: this.cfg.collateralUsdc,
      leverage: this.cfg.leverage,
      slippagePct: args.slippagePct,
    });
    return { txSig: opened.txSig };
  }

  async getUserPositions(): Promise<PositionView[]> {
    const { flashClient, POOL_CONFIG } = await this.client();
    const positions = await flashClient.getUserPositions(this.cfg.walletKeypair!.publicKey, POOL_CONFIG);
    return positions.map((p: any) => {
      const market = POOL_CONFIG.markets.find((m: any) => m.marketAccount.equals(p.market));
      const targetToken = market
        ? POOL_CONFIG.tokens.find((t: any) => t.mintKey.equals(market.targetMint))
        : null;
      const key = sideKeyOf(market?.side);
      return {
        positionKey: p.pubkey.toBase58(),
        side: (key === "short" ? "short" : "long") as Side,
        sizeUsd: 0, // SDK exposes raw BNs; mainnet API path returns real numbers.
        collateralUsd: 0,
        entryPrice: 0,
        marketSymbol: targetToken?.symbol ?? "",
      };
    });
  }

  private async findOpenedPositionKey(side: Side): Promise<string> {
    const positions = await this.getUserPositions();
    const match = positions.find(
      (p) => p.side === side && p.marketSymbol.toUpperCase() === this.cfg.asset.toUpperCase()
    );
    if (!match) throw new Error(`findOpenedPositionKey: no ${side} ${this.cfg.asset} position found post-open`);
    return match.positionKey;
  }
}
