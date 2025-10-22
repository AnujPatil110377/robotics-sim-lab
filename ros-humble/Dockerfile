# ROS 2 Humble on Ubuntu 22.04 with XFCE + TigerVNC + noVNC
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    DISPLAY=:1 \
    VNC_PORT=5901 \
    NOVNC_PORT=6080 \
    USER=developer \
    PASS=developer

# Base OS + GUI + VNC stack + helpers
RUN apt-get update --fix-missing && apt-get install -y \
      locales tzdata sudo curl wget gnupg2 ca-certificates lsb-release \
      software-properties-common \
      xfce4 xfce4-goodies x11-apps mesa-utils dbus-x11 \
      tigervnc-standalone-server novnc websockify \
      supervisor \
      build-essential cmake git python3-pip python3-venv \
      vim nano htop less procps net-tools iproute2 \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# ---------- ROS 2 Humble ----------
# Key + repo
RUN curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \
      -o /usr/share/keyrings/ros-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] \
      http://packages.ros.org/ros2/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) main" \
      > /etc/apt/sources.list.d/ros2.list

# Core install (desktop-full is heavy; desktop is enough for most)
ARG ROS_META=ros-humble-desktop
RUN apt-get update --fix-missing && \
    apt-get install -y ${ROS_META} && \
    rm -rf /var/lib/apt/lists/*

# Optional extras (toggle at build time)
ARG INSTALL_GAZEBO=false
ARG INSTALL_NAV2=false
ARG INSTALL_TURTLEBOT=false
RUN if [ "$INSTALL_GAZEBO" = "true" ]; then \
      apt-get update && apt-get install -y ros-humble-gazebo-* && rm -rf /var/lib/apt/lists/*; fi
RUN if [ "$INSTALL_NAV2" = "true" ]; then \
      apt-get update && apt-get install -y ros-humble-nav2-* ros-humble-navigation2 && rm -rf /var/lib/apt/lists/*; fi
RUN if [ "$INSTALL_TURTLEBOT" = "true" ]; then \
      apt-get update && apt-get install -y ros-humble-turtlebot4-* && rm -rf /var/lib/apt/lists/*; fi

# Create non-root user with sudo (password = $PASS)
RUN useradd -m -s /bin/bash "$USER" && echo "$USER:$PASS" | chpasswd && usermod -aG sudo "$USER"

# Source ROS for root and user shells
RUN echo "source /opt/ros/humble/setup.bash" >> /etc/bash.bashrc && \
    echo "source /opt/ros/humble/setup.bash" >> /home/${USER}/.bashrc && \
    chown -R ${USER}:${USER} /home/${USER}

# Supervisor + startup
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

EXPOSE 6080 
CMD ["/startup.sh"]



