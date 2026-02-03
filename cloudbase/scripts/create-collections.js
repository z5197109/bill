// 创建数据库集合脚本
const cloud = require('@cloudbase/node-sdk');

// 初始化云开发
const app = cloud.init({
    env: process.env.CLOUDBASE_ENV || 'dev-4g40wh23d397fbae'
});

const db = app.database();

/**
 * 创建所有必要的集合
 * CloudBase 通过写入数据来自动创建集合
 */
async function createCollections() {
    console.log('开始创建数据库集合...');
    console.log('环境 ID:', process.env.CLOUDBASE_ENV || 'dev-4g40wh23d397fbae');

    const collections = [
        {
            name: 'users',
            initData: {
                _id: '_system_init_',
                openid: '_system_placeholder_',
                nickname: '系统初始化占位符',
                created_at: new Date(),
                _is_placeholder: true
            }
        },
        {
            name: 'ledgers',
            initData: {
                _id: '_system_init_',
                user_id: '_system_placeholder_',
                name: '系统初始化占位符',
                created_at: new Date(),
                _is_placeholder: true
            }
        },
        {
            name: 'bills',
            initData: {
                _id: '_system_init_',
                user_id: '_system_placeholder_',
                ledger_id: '_system_placeholder_',
                merchant: '系统初始化占位符',
                amount: 0,
                created_at: new Date(),
                _is_placeholder: true
            }
        },
        {
            name: 'categories',
            initData: {
                _id: '_system_init_',
                user_id: '_system_placeholder_',
                name: '系统初始化占位符',
                created_at: new Date(),
                _is_placeholder: true
            }
        },
        {
            name: 'category_rules',
            initData: {
                _id: '_system_init_',
                user_id: '_system_placeholder_',
                keyword: '_system_placeholder_',
                category: '未分类',
                created_at: new Date(),
                _is_placeholder: true
            }
        },
        {
            name: 'recurring_rules',
            initData: {
                _id: '_system_init_',
                user_id: '_system_placeholder_',
                name: '系统初始化占位符',
                created_at: new Date(),
                _is_placeholder: true
            }
        }
    ];

    for (const collection of collections) {
        try {
            console.log(`正在创建集合: ${collection.name}...`);

            // 尝试添加初始数据来创建集合
            await db.collection(collection.name).add({
                data: collection.initData
            });

            console.log(`✓ 集合 ${collection.name} 创建成功`);
        } catch (error) {
            if (error.message && error.message.includes('document already exists')) {
                console.log(`✓ 集合 ${collection.name} 已存在`);
            } else {
                console.error(`✗ 创建集合 ${collection.name} 失败:`, error.message);
            }
        }
    }

    // 清理占位符数据
    console.log('\n清理占位符数据...');
    for (const collection of collections) {
        try {
            await db.collection(collection.name).doc('_system_init_').remove();
            console.log(`✓ 已清理 ${collection.name} 占位符`);
        } catch (error) {
            // 忽略删除失败
        }
    }

    console.log('\n数据库集合创建完成！');
}

// 运行
createCollections()
    .then(() => {
        console.log('脚本执行成功');
        process.exit(0);
    })
    .catch(error => {
        console.error('脚本执行失败:', error);
        process.exit(1);
    });
