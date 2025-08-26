import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StreamingPayrollSolana } from "../target/types/streaming_payroll_solana";
import { assert } from "chai";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo, 
  TOKEN_PROGRAM_ID,
  getAccount 
} from "@solana/spl-token";

describe("streaming_payroll_solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.streamingPayrollSolana as Program<StreamingPayrollSolana>;

  // Helper to load local wallet from file
  function loadWallet(path: string) {
    return anchor.web3.Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(require("fs").readFileSync(path, "utf-8")))
    );
  }

  // Load wallets
  const employer = loadWallet("/Users/tusharmac/imp/Projects/Solana/testing_wallets/employer.json");
  const employee = loadWallet("/Users/tusharmac/imp/Projects/Solana/testing_wallets/employee.json");

  let mint: anchor.web3.PublicKey;
  let employerTokenAccount: any;
  let employeeTokenAccount: any;
  let streamPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;

  before(async ()=>{
    // 1️⃣ Create a new token mint
      mint = await createMint(
      provider.connection,
      employer,           // payer
      employer.publicKey, // mint authority
      null,               // freeze authority
      9                   // decimals
    );
    console.log("Created token mint:", mint.toBase58());

    // 2️⃣ Create token accounts for employer and employee
      employerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      employer,          // payer
      mint,              // mint
      employer.publicKey // owner
    );

      employeeTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      employer,          // payer
      mint,              // mint
      employee.publicKey // owner
    );

    console.log("Employer token account:", employerTokenAccount.address.toBase58());
    console.log("Employee token account:", employeeTokenAccount.address.toBase58());

    // 3️⃣ Mint tokens to employer's token account
    await mintTo(
      provider.connection,
      employer,                   // payer
      mint,                       // token mint
      employerTokenAccount.address, 
      employer,                   // authority
      1200                        // amount
    );

    // Fetch updated balances after mint
    const updatedEmployerToken = await getAccount(provider.connection, employerTokenAccount.address);
    console.log("Employer token balance after mint:", Number(updatedEmployerToken.amount)); // should be 1200

        // 4️⃣ Derive PDAs for stream and vault
    [streamPda] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), employer.publicKey.toBuffer(), employee.publicKey.toBuffer()],
      program.programId
    );

    [vaultPda] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), employer.publicKey.toBuffer(), employee.publicKey.toBuffer()],
      program.programId
    );

    console.log("Stream PDA:", streamPda.toBase58());
    console.log("Vault PDA:", vaultPda.toBase58());
  })
  
  it("Create a payroll stream and deposit tokens to vault", async () => {

    // 5️⃣ Call createStream (move 980 tokens to vault for employee)
    const tx = await program.methods
      .createStream(new anchor.BN(2)) //rate 2/sec
      .accounts({
        employer: employer.publicKey,
        employee: employee.publicKey,
        stream: streamPda,
        vault: vaultPda,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        employerTokenAccount: employerTokenAccount.address,
        employeeTokenAccount: employeeTokenAccount.address,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([employer])
      .rpc();

    console.log("Stream creation tx:", tx);

    // 7️⃣ Fetch the stream account and assert
    const stream = await program.account.stream.fetch(streamPda);

    console.log("Token Mint:", stream.tokenMint.toBase58());
  console.log("Token Decimals:", stream.tokenDecimals);
  console.log("Actual Mint:", mint.toBase58());


    assert.equal(stream.employer.toBase58(), employer.publicKey.toBase58(), "Employer should match");
    assert.equal(stream.employee.toBase58(), employee.publicKey.toBase58(), "Employee should match");
    assert.equal(stream.ratePerSecond.toString(), "2", "Rate per second should match");
    assert.equal(stream.claimedAmount.toString(), "0", "Claimed amount should be 0");
    assert.isTrue(stream.startTime.gt(new anchor.BN(0)), "Start time should be set");

    console.log("Payroll stream created successfully!");
  });

  it("Transfers tokens from employer to vault for payroll", async () => {
    const tx = await program.methods
      .depositToVault(new anchor.BN(980)) // now deposit 980 tokens
      .accounts({
        employer: employer.publicKey,
        employee: employee.publicKey,
        stream: streamPda,
        vault: vaultPda,
        tokenMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        employerTokenAccount: employerTokenAccount.address,
        employeeTokenAccount: employeeTokenAccount.address,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([employer])
      .rpc();

    console.log("Tokens transferred to vault. Tx:", tx);

    const vaultTokenAccount = await getAccount(provider.connection, vaultPda);
    const employerTokenAfter = await getAccount(provider.connection, employerTokenAccount.address);

    console.log("Employer balance:", Number(employerTokenAfter.amount));
    console.log("Vault balance:", Number(vaultTokenAccount.amount));

    assert.equal(Number(vaultTokenAccount.amount), 980, "Vault should have 980 tokens");
    assert.equal(Number(employerTokenAfter.amount), 220, "Employer should have 220 tokens left");
  });

  it("Employee claims tokens from stream after waiting", async () => {
  // Wait for ~30 seconds to let tokens accrue
  console.log("Waiting 30 seconds to simulate stream accrual...");
  await new Promise((resolve) => setTimeout(resolve, 30 * 1000));

  // Fetch the current Solana clock timestamp
  const clockAccount = await provider.connection.getAccountInfo(anchor.web3.SYSVAR_CLOCK_PUBKEY);
  const clockData = clockAccount!.data;
  const currentTimestamp = new anchor.BN(clockData.readBigInt64LE(8 * 4)); // Clock timestamp is at offset 8*4

  // Fetch stream account
  const stream = await program.account.stream.fetch(streamPda);
  
  // Calculate elapsed time in seconds
  const elapsedSeconds = currentTimestamp.sub(stream.startTime);
  const elapsedSecondsNumber = Math.max(0, elapsedSeconds.toNumber());
  
  // Calculate expected claim
  const expectedClaim = Math.min(
    elapsedSecondsNumber * stream.ratePerSecond.toNumber(),
    stream.depositedAmount.toNumber() - stream.claimedAmount.toNumber()
  );

  console.log("Current timestamp:", currentTimestamp.toString());
  console.log("Stream start time:", stream.startTime.toString());
  console.log("Elapsed seconds:", elapsedSecondsNumber);
  console.log("Expected claim:", expectedClaim);

  // Call claim
  const tx = await program.methods
    .claim()
    .accounts({
      employee: employee.publicKey,
      stream: streamPda,
      vault: vaultPda,
      employeeTokenAccount: employeeTokenAccount.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([employee])
    .rpc();

  console.log("Claim tx:", tx);

  // Check balances
  const employeeTokenAfter = await getAccount(provider.connection, employeeTokenAccount.address);
  const vaultTokenAfter = await getAccount(provider.connection, vaultPda);

  console.log("Employee balance after claim:", Number(employeeTokenAfter.amount));
  console.log("Vault balance after claim:", Number(vaultTokenAfter.amount));

  // Assert
  assert.equal(Number(employeeTokenAfter.amount), expectedClaim, "Employee should have claimed correct amount");
  assert.equal(Number(vaultTokenAfter.amount), stream.depositedAmount.toNumber() - expectedClaim, "Vault balance should reduce accordingly");

  // Check claimedAmount updated
  const updatedStream = await program.account.stream.fetch(streamPda);
  assert.equal(Number(updatedStream.claimedAmount), expectedClaim, "Stream claimedAmount should be updated");
});


});