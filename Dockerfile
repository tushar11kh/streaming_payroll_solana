# ---------- Base Image ----------
FROM ubuntu:24.04 as builder

# ---------- Install curl ----------
RUN apt-get update && apt-get install -y \
        curl \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    ca-certificates \
    libudev-dev \
    libusb-1.0-0-dev \
    zlib1g-dev \
    llvm \
    clang \
    cmake \
    make \
    libprotobuf-dev \
    protobuf-compiler \
    libclang-dev \
    nodejs \
    npm \
 && rm -rf /var/lib/apt/lists/*

# ---------- Install Rust ----------
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustc --version

# ---------- Install Solana CLI ----------
RUN sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# ---------- Installing Anchor ----------
RUN cargo install --git https://github.com/solana-foundation/anchor avm --force
RUN avm install latest
RUN avm use latest

# ---------- Installing yarn ----------
RUN npm install --global yarn

# ---------- Create workspace ----------
WORKDIR /streaming_payroll_solana

# ---------- Copy package.json and package-lock.json ---------- 
COPY package*.json ./ 

# Copy only Rust program sources
COPY Anchor.toml Cargo.toml ./ 
COPY programs/ ./programs/
COPY migrations/ ./migrations/

# ---------- Install project dependencies ---------- 
RUN npm install 

# ---------- Verify tools are available ----------
RUN which rustc && \
    which cargo && \
    echo $SHELL &&\
    solana --version && \
    anchor --version 

# ---------- Build the Anchor project ----------
RUN anchor build

# Copy scripts separately
COPY scripts/ ./scripts/
COPY wallet/ ./wallet/


# --------- Stage 2: Runtime image (minimal) ----------
FROM ubuntu:24.04 AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Copy only required Solana CLI tools from builder stage
COPY --from=builder /root/.local/share/solana/install/active_release/bin/solana /usr/local/bin/
COPY --from=builder /root/.local/share/solana/install/active_release/bin/solana-keygen /usr/local/bin/
COPY --from=builder /root/.local/share/solana/install/active_release/bin/solana-test-validator /usr/local/bin/
ENV PATH="/usr/local/bin:${PATH}"


# Create app dir and user
RUN mkdir -p /app /ledger && \
    chown -R ubuntu:ubuntu /app /ledger

USER ubuntu

# Copy program artifacts from builder (adjust PROGRAM if your crate name differs)
COPY --from=builder --chown=1000:1000 /streaming_payroll_solana/target/deploy/ /app/streaming_payroll_solana/target/deploy/
COPY --from=builder --chown=1000:1000 /streaming_payroll_solana/target/sbpf-solana-solana/ /app/streaming_payroll_solana/target/sbpf-solana-solana/
COPY --from=builder --chown=1000:1000 /streaming_payroll_solana/wallet/ /app/streaming_payroll_solana/wallet/
COPY --from=builder --chown=1000:1000 /streaming_payroll_solana/scripts/ /app/streaming_payroll_solana/scripts/


# Copy your deploy script

RUN chmod +x /app/streaming_payroll_solana/scripts/deploy_and_run.sh


USER 1000
WORKDIR /app
EXPOSE 8899 8900-8905
VOLUME ["/app/ledger"]

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD solana catchup --url http://localhost:8899 || exit 1

ENTRYPOINT ["/app/streaming_payroll_solana/scripts/deploy_and_run.sh"]
