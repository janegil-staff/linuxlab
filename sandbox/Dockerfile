FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash coreutils ca-certificates \
      curl wget git vim nano less \
      python3 python3-pip python3-venv \
      build-essential \
      iproute2 procps \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash sandbox

RUN printf '%s\n' \
      'export PS1="\[\e[38;5;173m\]qup\[\e[0m\]:\w\$ "' \
      'echo "Qup Terminal sandbox — isolated, disposable session."' \
      'echo "Your home is writable; the rest of the system is not."' \
      > /home/sandbox/.bashrc \
    && chown sandbox:sandbox /home/sandbox/.bashrc

USER sandbox
WORKDIR /home/sandbox

CMD ["/bin/bash"]
