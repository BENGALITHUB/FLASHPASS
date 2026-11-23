import mongoose from 'mongoose';
import dns from 'dns';

// Fix for Windows / ISP DNS blocking MongoDB SRV queries
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore in environments where setting servers is restricted
}

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error(`[MongoDB Connection Error]`, err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn(`[MongoDB Warning] Disconnected from Atlas. Mongoose will attempt auto-reconnect.`);
    });

    return conn;
  } catch (error) {
    console.error(`[MongoDB Initial Connection Error] ${error.message}`);
    process.exit(1);
  }
};
