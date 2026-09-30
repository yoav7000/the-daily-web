const fs = require('fs');
const path = require('path');

// 1. Patch app.js
const appJsPath = path.join(__dirname, 'src', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');
if (!appJs.includes('renderArticlePage')) {
    appJs = appJs.replace(
        `app.get('/api/health', (req, res) => {\n    res.status(200).json({ status: 'ok', timestamp: new Date() });\n});`,
        `app.get('/api/health', (req, res) => {\n    res.status(200).json({ status: 'ok', timestamp: new Date() });\n});\n\n// EJS Page Routes\nconst articleController = require('./controllers/articleController');\napp.get('/article/:id', articleController.renderArticlePage);`
    );
    fs.writeFileSync(appJsPath, appJs);
}

// 2. Patch articleController.js
const articleCtrlPath = path.join(__dirname, 'src', 'controllers', 'articleController.js');
let articleCtrl = fs.readFileSync(articleCtrlPath, 'utf8');
if (!articleCtrl.includes('renderArticlePage')) {
    const renderMethod = `\nconst renderArticlePage = async (req, res, next) => {\n    try {\n        const article = await Article.findOne({\n            _id: req.params.id,\n            status: ARTICLE_STATUS.PUBLISHED\n        }).populate('author', 'fullName username');\n\n        if (!article) {\n            return res.status(404).send('הכתבה לא נמצאה או שטרם פורסמה');\n        }\n\n        recordViewInternal(article._id);\n\n        res.render('article', {\n            article: {\n                _id: article._id,\n                title: article.title,\n                summary: article.summary,\n                content: article.content,\n                category: article.category,\n                mainImage: article.mainImage,\n                author: article.author,\n                publishedAt: article.publishedAt\n            }\n        });\n    } catch (error) {\n        next(error);\n    }\n};\n`;
    articleCtrl = articleCtrl.replace('getPublicArticleById\n};', 'getPublicArticleById\n};\n' + renderMethod + '\nmodule.exports.renderArticlePage = renderArticlePage;');
    fs.writeFileSync(articleCtrlPath, articleCtrl);
}

// 3. Patch db.js
const dbJsPath = path.join(__dirname, 'src', 'config', 'db.js');
let dbJs = fs.readFileSync(dbJsPath, 'utf8');
if (!dbJs.includes('MongoMemoryServer')) {
    const memoryFallback = `    let mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/the-daily-web';\n\n    try {\n        const conn = await mongoose.connect(mongoURI, {\n            serverSelectionTimeoutMS: 2000\n        });\n\n        console.log(\`[MongoDB] Connected successfully to host: \${conn.connection.host}, database: \${conn.connection.name}\`);\n        return conn;\n    } catch (error) {\n        console.warn(\`[MongoDB] Connection error: \${error.message}. Starting IN-MEMORY fallback...\`);\n        try {\n            const { MongoMemoryServer } = require('mongodb-memory-server');\n            const mongoServer = await MongoMemoryServer.create();\n            mongoURI = mongoServer.getUri();\n            \n            const conn = await mongoose.connect(mongoURI);\n            console.log(\`[MongoDB] Connected to IN-MEMORY database successfully.\`);\n            \n            // Seed DB\n            const Article = require('../models/Article');\n            const User = require('../models/User');\n            if (await Article.countDocuments() === 0) {\n                let dummyUser = await User.findOne({ email: 'test@example.com' });\n                if (!dummyUser) {\n                    dummyUser = await User.create({\n                        fullName: 'Test Reporter',\n                        username: 'testreporter123',\n                        email: 'test@example.com',\n                        password: 'Password123!',\n                        role: 'reporter'\n                    });\n                }\n                await Article.create({\n                    title: 'כתבת דמה לבדיקות עיצוב (ממורי-DB)',\n                    summary: 'השרת פועל עם מסד נתונים זמני בזיכרון, לכן כתבה זו נוצרה אוטומטית כדי שתוכלו לבדוק את הפיד.',\n                    content: '<p>טקסט הכתבה המלא עבור בדיקות.</p>',\n                    category: 'כלכלה',\n                    status: 'published',\n                    publishedAt: new Date(),\n                    author: dummyUser._id\n                });\n            }\n            return conn;\n        } catch (memError) {\n            throw memError;\n        }\n    }`;
    dbJs = dbJs.replace(/const mongoURI.*?throw error;\n    }/s, memoryFallback);
    fs.writeFileSync(dbJsPath, dbJs);
}

// 4. Patch index.html
const indexHtmlPath = path.join(__dirname, 'public', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
if (indexHtml.includes('onclick="openArticleById(\'${art._id}\')"')) {
    indexHtml = indexHtml.replace(/<article class="news-card" onclick="openArticleById\('\$\{art._id\}'\)">/g, 
        '<a href="/article/${art._id}" class="text-decoration-none text-dark d-block">\n                        <article class="news-card">');
    indexHtml = indexHtml.replace(/<\/span>\n                        <\/div>\n                    <\/article>/g, 
        '</span>\n                        </div>\n                    </article>\n                    </a>');
    
    // secondary leads
    indexHtml = indexHtml.replace(/const item = document.createElement\('div'\);\n                item.className = 'd-flex gap-3 py-2 border-bottom';\n                item.style.cursor = 'pointer';\n                item.onclick = \(\) => openArticleById\(art._id\);/g,
        'const item = document.createElement(\'a\');\n                item.href = `/article/${art._id}`;\n                item.className = \'d-flex gap-3 py-2 border-bottom text-decoration-none text-dark\';');
        
    // top articles
    indexHtml = indexHtml.replace(/const div = document.createElement\('div'\);\n                        div.className = 'trending-item';\n                        div.onclick = \(\) => openArticleById\(art._id\);/g,
        'const div = document.createElement(\'a\');\n                        div.href = `/article/${art._id}`;\n                        div.className = \'trending-item text-decoration-none text-dark d-block\';');
        
    // hero article
    indexHtml = indexHtml.replace(/function openHeroArticle\(\) {\n            if \(heroArticleData\) openArticleById\(heroArticleData._id\);\n        }/g,
        'function openHeroArticle() {\n            if (heroArticleData) window.location.href = `/article/${heroArticleData._id}`;\n        }');
    
    fs.writeFileSync(indexHtmlPath, indexHtml);
}
