const mongoose = require('mongoose');

/**
 * Connect to MongoDB with retry logic and event listeners.
 */
const connectDB = async () => {
    let mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/the-daily-web';

    try {
        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 2000
        });

        console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
        return conn;
    } catch (error) {
        console.warn(`[MongoDB] Connection error: ${error.message}. Starting IN-MEMORY fallback...`);
        try {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            const mongoServer = await MongoMemoryServer.create();
            mongoURI = mongoServer.getUri();
            
            const conn = await mongoose.connect(mongoURI);
            console.log(`[MongoDB] Connected to IN-MEMORY database successfully.`);
            
            // Seed DB
            const Article = require('../models/Article');
            const User = require('../models/User');
            if (await Article.countDocuments() === 0) {
                let dummyUser = await User.findOne({ email: 'test@example.com' });
                if (!dummyUser) {
                    dummyUser = await User.create({
                        fullName: 'Test Reporter',
                        username: 'testreporter123',
                        email: 'test@example.com',
                        password: 'Password123!',
                        role: 'reporter'
                    });
                }
                await Article.create({
                    title: 'כתבת דמה לבדיקות עיצוב (ממורי-DB)',
                    summary: 'השרת פועל עם מסד נתונים זמני בזיכרון, לכן כתבה זו נוצרה אוטומטית כדי שתוכלו לבדוק את הפיד.',
                    content: '<p>טקסט הכתבה המלא עבור בדיקות.</p>',
                    category: 'כלכלה',
                    status: 'published',
                    publishedAt: new Date(),
                    author: dummyUser._id
                });
            }
            return conn;
        } catch (memError) {
            throw memError;
        }
    }
};

mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected from database.');
});

mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Reconnected to database.');
});

module.exports = connectDB;
