export const TOOL_FIXTURES = [
  {
    name: 'check_order_status',
    description: 'Look up the current status of a customer order by order ID',
    parameters: {
      type: 'object',
      properties: { order_id: { type: 'string', description: 'The order ID (e.g., ORD-123)' } },
      required: ['order_id'],
    },
    mockResponses: [
      { when: { order_id: 'ORD-123' }, return: { status: 'shipped', tracking_number: '1Z999AA10123456784', estimated_delivery: '2026-04-05' }, description: 'Shipped order' },
      { when: { order_id: 'ORD-456' }, return: { status: 'cancelled', cancelled_reason: 'customer_request', refund_status: 'processed' }, description: 'Cancelled order' },
      { when: { order_id: 'ORD-789' }, return: { status: 'processing', estimated_ship_date: '2026-04-03' }, description: 'Processing order' },
      { when: { order_id: 'ORD-101' }, return: { status: 'delivered', delivered_date: '2026-03-28', signed_by: 'Front Desk' }, description: 'Delivered order' },
      { isDefault: true, return: { status: 'not_found', message: 'No order found with that ID' }, description: 'Default — not found' },
    ],
    tags: ['support', 'orders'],
    isActive: true,
    createdBy: 'seed',
  },
  {
    name: 'process_refund',
    description: 'Submit a refund request for a customer order',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'The order ID to refund' },
        reason: { type: 'string', description: 'Reason for the refund' },
        amount: { type: 'number', description: 'Refund amount in dollars (optional, defaults to full refund)' },
      },
      required: ['order_id', 'reason'],
    },
    mockResponses: [
      { isDefault: true, return: { refund_id: 'REF-8821', status: 'approved', amount: 49.99, estimated_completion: '5-7 business days' }, description: 'Refund approved' },
    ],
    tags: ['support', 'billing'],
    isActive: true,
    createdBy: 'seed',
  },
  {
    name: 'get_customer_info',
    description: 'Look up customer account details by email address',
    parameters: {
      type: 'object',
      properties: { email: { type: 'string', description: 'Customer email address' } },
      required: ['email'],
    },
    mockResponses: [
      { when: { email: 'jane@example.com' }, return: { name: 'Jane Smith', tier: 'premium', member_since: '2024-01-15', total_orders: 12 }, description: 'Premium customer (VIP Executive)' },
      { when: { email: 'bob@example.com' }, return: { name: 'Bob Wilson', tier: 'pro', member_since: '2025-06-20', total_orders: 2 }, description: 'Pro customer (Cancellation Risk)' },
      { when: { email: 'karen@example.com' }, return: { name: 'Karen Davis', tier: 'pro', member_since: '2025-02-10', total_orders: 5 }, description: 'Pro customer (Angry Karen)' },
      { when: { email: 'james@example.com' }, return: { name: 'James Chen', tier: 'basic', member_since: '2025-11-01', total_orders: 3 }, description: 'Basic customer (Calm James)' },
      { when: { email: 'harold@example.com' }, return: { name: 'Harold Thompson', tier: 'basic', member_since: '2024-06-15', total_orders: 8 }, description: 'Loyal basic customer (Elderly Harold)' },
      { when: { email: 'maya@example.com' }, return: { name: 'Maya Rodriguez', tier: 'pro', member_since: '2025-04-10', total_orders: 6 }, description: 'Pro customer (Multi-Issue Maya)' },
      { when: { email: 'maria@example.com' }, return: { name: 'Maria Santos', tier: 'none', member_since: null, total_orders: 0 }, description: 'Prospect (Curious Maria)' },
      { isDefault: true, return: { error: 'customer_not_found', message: 'No account found with that email' }, description: 'Default — not found' },
    ],
    tags: ['support', 'crm'],
    isActive: true,
    createdBy: 'seed',
  },
  {
    name: 'transfer_to_agent',
    description: 'Transfer the customer to a specialized department',
    parameters: {
      type: 'object',
      properties: {
        department: { type: 'string', enum: ['billing', 'technical', 'sales', 'retention'], description: 'Department to transfer to' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Transfer priority level' },
        notes: { type: 'string', description: 'Context notes for the receiving agent' },
      },
      required: ['department'],
    },
    mockResponses: [
      { isDefault: true, return: { transfer_id: 'TRF-4491', status: 'queued', estimated_wait: '2-3 minutes' }, description: 'Transfer queued' },
    ],
    tags: ['support', 'escalation'],
    isActive: true,
    createdBy: 'seed',
  },
  {
    name: 'search_knowledge_base',
    description: 'Search the help center knowledge base for relevant articles',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', enum: ['billing', 'technical', 'shipping', 'returns', 'account'], description: 'Article category filter (optional)' },
      },
      required: ['query'],
    },
    mockResponses: [
      { when: { query: 'return policy' }, return: { results: [{ title: 'Return Policy', content: 'Returns accepted within 30 days of delivery. Original packaging required. Receipt required. Refunds processed in 5-7 business days. Free return shipping for Premium customers only. Standard customers pay $9.99 return shipping. Electronics must be unopened. Software is non-refundable. No returns on sale or clearance items.' }] }, description: 'Return policy article' },
      { when: { query: 'reset password' }, return: { results: [{ title: 'Password Reset Guide', content: 'Go to Settings > Security > Reset Password. You will receive a verification email within 2-5 minutes. Click the link to set a new password. If you don\'t receive the email, check your spam folder.' }] }, description: 'Password reset article' },
      { isDefault: true, return: { results: [], message: 'No articles found matching your query' }, description: 'Default — no results' },
    ],
    tags: ['support', 'self-service'],
    isActive: true,
    createdBy: 'seed',
  },
  {
    name: 'apply_discount',
    description: 'Apply a discount code or retention offer to a customer account',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Customer email' },
        discount_type: { type: 'string', enum: ['percentage', 'fixed', 'free_month'], description: 'Type of discount' },
        value: { type: 'number', description: 'Discount value (percentage or dollar amount)' },
        reason: { type: 'string', description: 'Reason for the discount' },
      },
      required: ['email', 'discount_type', 'value', 'reason'],
    },
    mockResponses: [
      { isDefault: true, return: { applied: true, discount_id: 'DSC-771', new_monthly_total: 39.99, valid_until: '2026-07-01' }, description: 'Discount applied' },
    ],
    tags: ['retention', 'billing'],
    isActive: true,
    createdBy: 'seed',
  },
];
