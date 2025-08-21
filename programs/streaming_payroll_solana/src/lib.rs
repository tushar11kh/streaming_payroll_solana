use anchor_lang::prelude::*;

declare_id!("AQgEzkKH5QkFYfG7kMXnnNwJEtKcaaimhCQUSW4MvDAD");

#[program]
pub mod streaming_payroll_solana {
    use super::*;

    pub fn create_stream(
        ctx: Context<CreateStream>,
        deposited_amount: u64,
        rate_per_second: u64,
    ) -> Result<()>{
        let stream = &mut ctx.accounts.stream;
        stream.employer = ctx.accounts.employer.key();
        stream.employee = ctx.accounts.employee.key();
        stream.start_time = Clock::get()?.unix_timestamp;
        stream.rate_per_second = rate_per_second;
        stream.deposited_amount = deposited_amount;
        stream.claimed_amount = 0;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateStream<'info>{

    #[account(mut)]
    pub employer: Signer<'info>,

    /// CHECK: Employee doesn’t need to sign now
    pub employee: UncheckedAccount<'info>,

    #[account(
        init,
        payer = employer,
        space = 8+32+32+8+8+8+8,
        seeds = [b"stream",employer.key().as_ref(),employee.key().as_ref()],
        bump
    )]

    pub stream: Account<'info,Stream>,

    pub system_program: Program<'info,System>,
}

#[account]
pub struct Stream{
    pub employer: Pubkey,
    pub employee: Pubkey,
    pub start_time: i64,
    pub rate_per_second: u64,
    pub deposited_amount: u64,
    pub claimed_amount: u64,
}

