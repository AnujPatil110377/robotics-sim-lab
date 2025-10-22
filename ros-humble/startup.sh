#!/usr/bin/env bash
set -e

# Ensure user owns home and has ROS sourced
chown -R developer:developer /home/developer
if ! grep -q "source /opt/ros/humble/setup.bash" /home/developer/.bashrc 2>/dev/null; then
  echo "source /opt/ros/humble/setup.bash" >> /home/developer/.bashrc
fi

# Start supervisor (spawns VNC, noVNC, XFCE)
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
