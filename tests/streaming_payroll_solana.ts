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
  const employer = loadWallet("/Users/tusharmac/imp/Projects/Solana/testing_wallets/dev1.json");
  const employee = loadWallet("/Users/tusharmac/imp/Projects/Solana/testing_wallets/dev2.json");

  it("Create a payroll stream and deposit tokens to vault", async () => {
    // 1️⃣ Create a new token mint
    const mint = await createMint(
      provider.connection,
      employer,           // payer
      employer.publicKey, // mint authority
      null,               // freeze authority
      9                   // decimals
    );
    console.log("Created token mint:", mint.toBase58());

    // 2️⃣ Create token accounts for employer and employee
    const employerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      employer,          // payer
      mint,              // mint
      employer.publicKey // owner
    );

    const employeeTokenAccount = await getOrCreateAssociatedTokenAccount(
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
    const [streamPda] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stream"), employer.publicKey.toBuffer(), employee.publicKey.toBuffer()],
      program.programId
    );

    const [vaultPda] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), employer.publicKey.toBuffer(), employee.publicKey.toBuffer()],
      program.programId
    );

    console.log("Stream PDA:", streamPda.toBase58());
    console.log("Vault PDA:", vaultPda.toBase58());

    // 5️⃣ Call createStream (move 980 tokens to vault for employee)
    const tx = await program.methods
      .createStream(new anchor.BN(980), new anchor.BN(2)) // deposit 980 tokens, rate 2/sec
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

    console.log("Transaction signature:", tx);

    // 6️⃣ Fetch updated balances after stream creation
    const vaultTokenAccount = await getAccount(provider.connection, vaultPda);
    const employerTokenAfter = await getAccount(provider.connection, employerTokenAccount.address);
    const employeeTokenAfter = await getAccount(provider.connection, employeeTokenAccount.address);

    console.log("Employer token balance after stream:", Number(employerTokenAfter.amount)); // should be 220 (1200 - 980)
    console.log("Vault token balance:", Number(vaultTokenAccount.amount)); // should be 980
    console.log("Employee token balance:", Number(employeeTokenAfter.amount)); // should still be 0

    // 7️⃣ Fetch the stream account and assert
    const stream = await program.account.stream.fetch(streamPda);

    assert.equal(stream.employer.toBase58(), employer.publicKey.toBase58(), "Employer should match");
    assert.equal(stream.employee.toBase58(), employee.publicKey.toBase58(), "Employee should match");
    assert.equal(stream.depositedAmount.toString(), "980", "Deposited amount should match");
    assert.equal(stream.ratePerSecond.toString(), "2", "Rate per second should match");
    assert.equal(stream.claimedAmount.toString(), "0", "Claimed amount should be 0");
    assert.isTrue(stream.startTime.gt(new anchor.BN(0)), "Start time should be set");

    console.log("Payroll stream created successfully!");
  });
});
