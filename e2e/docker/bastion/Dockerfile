# Throwaway SSH server for the tunnel tests. Not for any use outside the e2e network.
FROM alpine:3.20
RUN apk add --no-cache openssh-server openssh-keygen netcat-openbsd \
    && adduser -D -s /bin/sh tunnel \
    && echo 'tunnel:tunnel-secret' | chpasswd \
    && printf 'AllowTcpForwarding yes\nPasswordAuthentication yes\nPubkeyAuthentication yes\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/e2e.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
