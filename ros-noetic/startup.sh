#!/usr/bin/env bash
set -e
chown -R developer:developer /home/developer
if ! grep -q "source /opt/ros/noetic/setup.bash" /home/developer/.bashrc 2>/dev/null; then
  echo "source /opt/ros/noetic/setup.bash" >> /home/developer/.bashrc
fi
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
