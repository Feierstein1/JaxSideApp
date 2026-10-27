#!/bin/bash
# D139: one-time setup for a new staging server, run as root over SSH:
#   ssh -i ~/.ssh/jaxside-staging.pem ubuntu@<ip> 'sudo bash -s' < deploy/staging/server-init.sh
# (Lightsail's user data runs scripts with sh, not bash, so it can't be used for this.)
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

# 4 GB of swap: building the server image needs more than the 2 GB of RAM.
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-swap.conf && sysctl --system
fi

apt-get update
apt-get install -y docker.io docker-compose-v2 unattended-upgrades
systemctl enable --now docker
usermod -aG docker ubuntu

# Security updates install themselves (the default on Ubuntu, made explicit).
dpkg-reconfigure -f noninteractive unattended-upgrades

mkdir -p /opt/jaxside && chown ubuntu:ubuntu /opt/jaxside
timedatectl set-timezone America/New_York
touch /var/lib/jaxside-init-done
