import {
  createPublicClient,
  createWalletClient,
  http,
  getContract,
  parseEther,
  type PublicClient,
  type GetContractReturnType,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { EscrowABI } from './abi';

export enum PaymentStatus {
  None = 0,
  Locked = 1,
  Released = 2,
  Refunded = 3,
}

export interface Payment {
  agent: `0x${string}`;
  provider: `0x${string}`;
  amount: bigint;
  hashLock: `0x${string}`;
  deadline: bigint;
  status: PaymentStatus;
}

export interface EscrowClientConfig {
  privateKey: `0x${string}`;
  rpcUrl: string;
  escrowAddress: `0x${string}`;
  chainId?: number;
}

export interface OpenParams {
  requestId: `0x${string}`;
  provider: `0x${string}`;
  hashLock: `0x${string}`;
  deadline: bigint;
  amount: bigint | string;
}

export interface PaymentReleasedEvent {
  requestId: `0x${string}`;
  provider: `0x${string}`;
  amount: bigint;
  preimage: `0x${string}`;
}

// Define a minimal chain for custom networks
const createChain = (chainId: number, rpcUrl: string): Chain => ({
  id: chainId,
  name: 'Custom Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
});

export class EscrowClient {
  private publicClient: PublicClient;
  private walletClient: ReturnType<typeof createWalletClient>;
  private contract: GetContractReturnType<typeof EscrowABI, PublicClient>;
  private account: ReturnType<typeof privateKeyToAccount>;
  private escrowAddress: `0x${string}`;
  private chain: Chain;

  constructor(config: EscrowClientConfig) {
    this.chain = createChain(config.chainId ?? 1, config.rpcUrl);
    this.account = privateKeyToAccount(config.privateKey);
    this.escrowAddress = config.escrowAddress;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.rpcUrl),
    });

    this.contract = getContract({
      address: config.escrowAddress,
      abi: EscrowABI,
      client: this.publicClient,
    });
  }

  get address(): `0x${string}` {
    return this.account.address;
  }

  /**
   * Lock funds in escrow for a service request
   */
  async open(params: OpenParams): Promise<`0x${string}`> {
    const amount = typeof params.amount === 'string' ? parseEther(params.amount) : params.amount;

    const hash = await this.walletClient.writeContract({
      address: this.escrowAddress,
      abi: EscrowABI,
      functionName: 'open',
      args: [params.requestId, params.provider, params.hashLock, params.deadline],
      value: amount,
      chain: this.chain,
      account: this.account,
    });

    return hash;
  }

  /**
   * Claim payment by revealing the preimage (provider only)
   */
  async claim(requestId: `0x${string}`, preimage: `0x${string}`): Promise<`0x${string}`> {
    const hash = await this.walletClient.writeContract({
      address: this.escrowAddress,
      abi: EscrowABI,
      functionName: 'claim',
      args: [requestId, preimage],
      chain: this.chain,
      account: this.account,
    });

    return hash;
  }

  /**
   * Refund payment after deadline (agent only)
   */
  async refund(requestId: `0x${string}`): Promise<`0x${string}`> {
    const hash = await this.walletClient.writeContract({
      address: this.escrowAddress,
      abi: EscrowABI,
      functionName: 'refund',
      args: [requestId],
      chain: this.chain,
      account: this.account,
    });

    return hash;
  }

  /**
   * Get payment details from the contract
   */
  async getPayment(requestId: `0x${string}`): Promise<Payment> {
    const result = await this.publicClient.readContract({
      address: this.escrowAddress,
      abi: EscrowABI,
      functionName: 'getPayment',
      args: [requestId],
    });

    return {
      agent: result.agent,
      provider: result.provider,
      amount: result.amount,
      hashLock: result.hashLock,
      deadline: result.deadline,
      status: result.status as PaymentStatus,
    };
  }

  /**
   * Wait for PaymentReleased event and return the preimage
   */
  async waitForPaymentReleased(
    requestId: `0x${string}`,
    timeoutMs: number = 60000
  ): Promise<PaymentReleasedEvent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unwatch();
        reject(new Error('Timeout waiting for PaymentReleased event'));
      }, timeoutMs);

      const unwatch = this.publicClient.watchContractEvent({
        address: this.escrowAddress,
        abi: EscrowABI,
        eventName: 'PaymentReleased',
        onLogs: (logs) => {
          for (const log of logs) {
            if (log.args.requestId === requestId) {
              clearTimeout(timeout);
              unwatch();
              resolve({
                requestId: log.args.requestId!,
                provider: log.args.provider!,
                amount: log.args.amount!,
                preimage: log.args.preimage!,
              });
              return;
            }
          }
        },
        onError: (error) => {
          clearTimeout(timeout);
          unwatch();
          reject(error);
        },
      });
    });
  }

  /**
   * Wait for transaction to be mined
   */
  async waitForTransaction(hash: `0x${string}`) {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }
}
