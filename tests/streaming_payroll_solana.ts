import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StreamingPayrollSolana } from "../target/types/streaming_payroll_solana";
import { assert } from "chai";

describe("streaming_payroll_solana", () => {
  // Configure the client to use the local cluster.

  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  const program = anchor.workspace.streamingPayrollSolana as Program<StreamingPayrollSolana>;
  const employer = provider.wallet;
  const employee = anchor.web3.Keypair.generate();

  it("Create a payroll stream", async () => {
    // Add your test here.
    
    const [streamPda] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stream"),employer.publicKey.toBuffer(),employee.publicKey.toBuffer()],program.programId
    );

    await program.methods
    .createStream(new anchor.BN(1000),new anchor.BN(1))
    .accounts({
      employer: employer.publicKey,
      employee: employee.publicKey,
      stream: streamPda,
      systemProgram: anchor.web3.SystemProgram.programId
    })
    .rpc();

    const stream = await program.account.stream.fetch(streamPda);
    assert.equal(stream.employer.toBase58(),employer.publicKey.toBase58());
    assert.equal(stream.employee.toBase58(),employee.publicKey.toBase58());
  });
});
