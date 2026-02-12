import { ethers } from 'hardhat';

/**
 * Mint MockERC20 tokens to a specified address.
 *
 * Usage:
 *   MINT_TO=0x... MINT_AMOUNT=10000 npx hardhat run scripts/mint-tokens.ts --network localhost
 *
 * Env vars:
 *   PAYMENT_TOKEN_ADDRESS — MockERC20 contract address (required)
 *   MINT_TO               — Recipient address (required)
 *   MINT_AMOUNT           — Amount in human-readable units, e.g. "10000" for 10,000 USDC (default: 10000)
 */
async function main() {
  const tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS;
  const mintTo = process.env.MINT_TO;
  const mintAmount = process.env.MINT_AMOUNT || '10000';

  if (!tokenAddress) {
    throw new Error('PAYMENT_TOKEN_ADDRESS env var is required');
  }
  if (!mintTo) {
    throw new Error('MINT_TO env var is required (recipient address)');
  }

  const token = await ethers.getContractAt('MockERC20', tokenAddress);
  const decimals = await token.decimals();
  const amount = ethers.parseUnits(mintAmount, decimals);

  await token.mint(mintTo, amount);

  const balance = await token.balanceOf(mintTo);
  console.log(`Minted ${ethers.formatUnits(amount, decimals)} USDC to ${mintTo}`);
  console.log(`New balance: ${ethers.formatUnits(balance, decimals)} USDC`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
