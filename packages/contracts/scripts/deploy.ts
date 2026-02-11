import { ethers } from 'hardhat';

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      'No signers available. Set DEPLOYER_PRIVATE_KEY in your .env.production file.'
    );
  }

  const [deployer] = signers;
  console.log('Deploying Escrow with account:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'ETH');

  const Escrow = await ethers.getContractFactory('Escrow');
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log('Escrow deployed to:', address);
  console.log('');
  console.log('Add to your .env:');
  console.log(`ESCROW_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
