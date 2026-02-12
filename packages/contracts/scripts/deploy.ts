import { ethers } from 'hardhat';

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error('No signers available. Set DEPLOYER_PRIVATE_KEY in your .env.production file.');
  }

  const [deployer] = signers;
  console.log('Deploying with account:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'ETH');

  // Determine payment token address
  let tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS;

  // If token address is set, verify the contract actually exists
  // (e.g., after Hardhat node restart, all contracts are wiped)
  if (tokenAddress) {
    const code = await ethers.provider.getCode(tokenAddress);
    if (code === '0x') {
      console.log(`\nPAYMENT_TOKEN_ADDRESS is set to ${tokenAddress} but no contract found.`);
      console.log('This typically happens after restarting the Hardhat node.');
      tokenAddress = '';
    }
  }

  if (!tokenAddress) {
    // No token address provided → deploy MockERC20 (local/testnet)
    console.log('\nNo PAYMENT_TOKEN_ADDRESS set — deploying MockERC20...');
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token = await MockERC20.deploy('Mock USDC', 'USDC', 6);
    await token.waitForDeployment();
    tokenAddress = await token.getAddress();
    console.log('MockERC20 deployed to:', tokenAddress);

    // Mint test tokens to all Hardhat accounts
    const mintAmount = ethers.parseUnits('10000', 6);
    for (let i = 0; i < Math.min(signers.length, 20); i++) {
      await token.mint(signers[i].address, mintAmount);
      console.log(`Minted ${ethers.formatUnits(mintAmount, 6)} USDC to Account #${i} (${signers[i].address})`);
    }
  } else {
    console.log('\nUsing existing token at:', tokenAddress);
  }

  // Deploy Escrow
  const Escrow = await ethers.getContractFactory('Escrow');
  const escrow = await Escrow.deploy(tokenAddress);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log('Escrow deployed to:', escrowAddress);
  console.log('');
  console.log('Add to your .env:');
  console.log(`PAYMENT_TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
  console.log(`PAYMENT_TOKEN_DECIMALS=6`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
