import { Accessor, createEffect, createSignal, onCleanup } from 'solid-js';
import { PublicClient, TransactionReceipt } from 'viem';
import { fetchTransactionHash } from '.';
import { AppConfig } from '../types/client';

interface UseTransactionReceiptOptions {
  client: PublicClient;
  appConfig: AppConfig;
  transactionId: string;
  confirmations?: number;
  timeout?: number;
  pollingInterval?: number;
}

interface UseTransactionReceiptResult {
  transactionHash: Accessor<`0x${string}` | null>;
  receipt: Accessor<TransactionReceipt | null>;
  isError: Accessor<boolean>;
  isLoading: Accessor<boolean>;
  isSuccess: Accessor<boolean>;
  error: Accessor<Error | null>;
  retrigger: () => void;
}

export function useWaitForTransactionReceipt(
  options: UseTransactionReceiptOptions,
): UseTransactionReceiptResult {
  const {
    client,
    appConfig,
    transactionId,
    confirmations = 1,
    timeout,
    pollingInterval = 4000,
  } = options;

  const [transactionHash, setTransactionHash] = createSignal<
    `0x${string}` | null
  >(null);
  const [receipt, setReceipt] = createSignal<TransactionReceipt | null>(null);
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [isError, setIsError] = createSignal<boolean>(false);
  const [error, setError] = createSignal<Error | null>(null);
  const [pollCount, setPollCount] = createSignal<number>(0);

  const reset = () => {
    setTransactionHash(null);
    setReceipt(null);
    setIsError(false);
    setError(null);
  };

  const retrigger = () => {
    reset();
    setIsLoading(false);
    setPollCount((count) => count + 1);
  };

  const fetchStatus = async () => {
    return await fetchTransactionHash(appConfig, transactionId);
  };

  createEffect(() => {
    if (!transactionId) {
      setIsLoading(false);
      return;
    }

    reset();
    setIsLoading(true);

    const abortController = new AbortController();
    const signal = abortController.signal;
    let timeoutId: number | null = null;

    const pollHash = async () => {
      if (signal.aborted) return;

      try {
        const status = await fetchStatus();

        if (signal.aborted) return;

        if (!status.transactionHash) {
          timeoutId = setTimeout(pollHash, pollingInterval);
        } else if (status.transactionHash) {
          setTransactionHash(status.transactionHash);
          setIsLoading(false);
        } else {
          timeoutId = setTimeout(pollHash, pollingInterval);
        }
      } catch (err) {
        if (signal.aborted) return;
        setIsError(true);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    };

    pollHash();

    onCleanup(() => {
      abortController.abort();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });
  }, [transactionId, pollCount]);

  createEffect(() => {
    const transactionHashVal = transactionHash();
    if (!transactionHashVal) return;
    if (receipt()) return;

    const abortController = new AbortController();
    const signal = abortController.signal;

    const fetchReceipt = async () => {
      try {
        const txnReceipt = await client.waitForTransactionReceipt({
          hash: transactionHashVal,
          confirmations,
          timeout,
        });
        if (signal.aborted) return;
        setReceipt(txnReceipt);
      } catch (err) {
        if (signal.aborted) return;
        setIsError(true);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    fetchReceipt();

    onCleanup(() => {
      abortController.abort();
    });
  }, [transactionHash, confirmations, timeout, client]);

  const isSuccess = () => receipt()?.status === 'success';

  return {
    transactionHash,
    receipt,
    isError,
    isLoading,
    isSuccess,
    error,
    retrigger,
  };
}
