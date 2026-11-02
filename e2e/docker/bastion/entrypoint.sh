#!/bin/sh
# Generates host keys and two client keys (one plain, one protected by the passphrase "key-secret") in
# /keys, which the backend container mounts read-only, then runs sshd.
set -eu
ssh-keygen -A
mkdir -p /keys /home/tunnel/.ssh
ssh-keygen -q -t ed25519 -N '' -f /keys/id_plain
ssh-keygen -q -t ed25519 -N 'key-secret' -f /keys/id_protected
cat /keys/id_plain.pub /keys/id_protected.pub > /home/tunnel/.ssh/authorized_keys
chown -R tunnel:tunnel /home/tunnel/.ssh
chmod 700 /home/tunnel/.ssh
chmod 600 /home/tunnel/.ssh/authorized_keys /keys/id_plain /keys/id_protected
touch /keys/.ready
exec /usr/sbin/sshd -D -e
