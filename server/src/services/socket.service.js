let ioInstance = null;

export const setSocketInstance = (io) => {
  ioInstance = io;
};

export const getSocketInstance = () => {
  return ioInstance;
};

export const emitTokenPaid = (tokenId, pass) => {
  if (ioInstance) {
    ioInstance.to(`token:${tokenId}`).emit('token:status', {
      status: 'PAID',
      pass
    });
  }
};

export const emitOrderPaid = (orderId, pass) => {
  if (ioInstance) {
    ioInstance.to(`order:${orderId}`).emit('order:status', {
      status: 'PAID',
      pass
    });
  }
};

export const emitGateStats = (stats) => {
  if (ioInstance) {
    ioInstance.emit('gate:stats', stats);
  }
};

export const emitAdminMetrics = (metrics) => {
  if (ioInstance) {
    ioInstance.emit('admin:metrics', metrics);
  }
};

export const emitEmergencyEvacuation = (payload) => {
  if (ioInstance) {
    ioInstance.emit('emergency:evacuation', payload);
  }
};

export const emitLiveAnnouncement = (payload) => {
  if (ioInstance) {
    ioInstance.emit('announcement:push', payload);
  }
};

export const emitNewInquiry = (inquiry) => {
  if (ioInstance) {
    ioInstance.emit('admin:new_inquiry', inquiry);
  }
};

