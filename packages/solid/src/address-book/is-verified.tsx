import { getIsUserVerified } from '@worldcoin/minikit-js';
import { Accessor, createEffect, createSignal, on } from 'solid-js';

/**
 * Checks if a user is Orb verified
 *
 * @param walletAddress - The wallet address of the user
 * @param rpcUrl - Your preferred RPC node URL, https://worldchain-mainnet.g.alchemy.com/public by default
 */
export const useIsUserVerified = (walletAddress: Accessor<string>, rpcUrl?: string) => {
  const [isUserVerified, setIsUserVerified] = createSignal<boolean | null>(
    null,
  );
  const [isLoading, setIsLoading] = createSignal(true);
  const [isError, setIsError] = createSignal<any>(null);

  createEffect(
    on(walletAddress, async () => {
      try {
        const data = await getIsUserVerified(walletAddress);
        setIsUserVerified(data);
      } catch (err) {
        setIsError(err);
      } finally {
        setIsLoading(false);
      }
    }),
  );

  return { isUserVerified, isLoading, isError };
};
