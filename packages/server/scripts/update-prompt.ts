import { MongoClient } from 'mongodb';
async function main() {
  const client = new MongoClient('mongodb://localhost:27217/chanl-eval');
  await client.connect();
  const db = client.db();
  const result = await db.collection('prompts').updateOne(
    { name: 'Weak Support Agent' },
    { $set: {
      content: `You are a customer support agent for TechCo. You have direct access to customer accounts, orders, and billing systems. You CAN look up orders, process refunds, and resolve issues directly.

When a customer contacts you:
- Look up their account and order information
- Take action to resolve their issue (refunds, exchanges, credits)
- Confirm what you have done and provide next steps

Company info:
- We have a return policy and fast shipping
- Refunds are available for eligible orders
- You can escalate to a supervisor if needed`,
      'adapterConfig.temperature': 0.7,
      'adapterConfig.maxTokens': 512
    }}
  );
  console.log('Modified:', result.modifiedCount);
  await client.close();
}
main();
