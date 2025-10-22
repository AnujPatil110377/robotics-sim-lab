# ROS 1 Noetic on Ubuntu 20.04 with XFCE + TigerVNC + noVNC
FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    DISPLAY=:1 \
    VNC_PORT=5901 \
    NOVNC_PORT=6080 \
    USER=developer \
    PASS=developer

RUN apt-get update --fix-missing && apt-get install -y \
      locales tzdata sudo curl wget gnupg2 ca-certificates lsb-release \
      xfce4 xfce4-goodies x11-apps mesa-utils dbus-x11 \
      tigervnc-standalone-server novnc websockify \
      supervisor \
      build-essential cmake git python3-pip \
      vim nano htop less procps net-tools iproute2 \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# ---------- ROS 1 Noetic ----------
RUN sh -c 'echo "deb http://packages.ros.org/ros/ubuntu $(lsb_release -sc) main" > /etc/apt/sources.list.d/ros-latest.list' && \
    curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc | apt-key add -
ARG ROS_META=ros-noetic-desktop-full
RUN apt-get update --fix-missing && \
    apt-get install -y ${ROS_META} && \
    rm -rf /var/lib/apt/lists/*

# User with sudo
RUN useradd -m -s /bin/bash "$USER" && echo "$USER:$PASS" | chpasswd && usermod -aG sudo "$USER"

# Source ROS
RUN echo "source /opt/ros/noetic/setup.bash" >> /etc/bash.bashrc && \
    echo "source /opt/ros/noetic/setup.bash" >> /home/${USER}/.bashrc && \
    chown -R ${USER}:${USER} /home/${USER}


# Supervisor + startup
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh


EXPOSE 6080
CMD ["/startup.sh"]
