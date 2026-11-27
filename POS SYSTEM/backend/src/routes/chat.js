const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../middleware/auth');

async function resolveTenant(req) {
  const slug = req.headers['x-tenant-slug'] || req.query.tenant || req.body?.tenantSlug || 'project-million';
  return prisma.tenant.findUnique({ where: { slug: String(slug) } });
}

function sessionValue(value) {
  return String(value || '').trim().slice(0, 120);
}

function isAdminSupportAvailable() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const minutes = Number(parts.find(part => part.type === 'hour')?.value || 0) * 60 + Number(parts.find(part => part.type === 'minute')?.value || 0);
  return minutes >= 480 && minutes < 1200;
}

const conversationInclude = {
  messages: { orderBy: { createdAt: 'asc' } },
  customer: { select: { id: true, name: true, email: true } }
};

function adminConversationView(conversation) {
  if (!conversation) return conversation;
  const acceptedAt = conversation.adminAcceptedAt ? new Date(conversation.adminAcceptedAt).getTime() : null;
  const messages = acceptedAt
    ? (conversation.messages || []).filter(message => new Date(message.createdAt).getTime() >= acceptedAt)
    : (conversation.messages || []).filter(message => message.senderType === 'customer' && /talk to an admin/i.test(message.content));
  return { ...conversation, messages };
}

// Customer chat endpoints are public so guests can request support.
router.get('/conversation', async (req, res) => {
  try {
    const tenant = await resolveTenant(req);
    const sessionId = sessionValue(req.query.sessionId);
    if (!tenant || !sessionId) return res.status(400).json({ success: false, message: 'A valid chat session is required.' });
    const conversation = await prisma.chatConversation.findUnique({
      where: { tenantId_sessionId: { tenantId: tenant.id, sessionId } },
      include: conversationInclude
    });
    res.json({ success: true, data: conversation });
  } catch (error) {
    console.error('Chat load error:', error);
    res.status(500).json({ success: false, message: 'Failed to load chat.' });
  }
});

router.post('/conversation/messages', async (req, res) => {
  try {
    const tenant = await resolveTenant(req);
    const sessionId = sessionValue(req.body.sessionId);
    const content = String(req.body.content || '').trim().slice(0, 1000);
    if (!tenant || !sessionId || !content) return res.status(400).json({ success: false, message: 'Chat message is required.' });

    const existingConversation = await prisma.chatConversation.findUnique({
      where: { tenantId_sessionId: { tenantId: tenant.id, sessionId } }
    });
    if (existingConversation?.status === 'requested' && !req.body.escalate) {
      return res.status(409).json({ success: false, message: 'Please wait for an admin to accept the chat request.' });
    }
    if (req.body.escalate && !isAdminSupportAvailable()) {
      return res.status(409).json({ success: false, message: 'Admin support is available from 8:00 AM to 8:00 PM.' });
    }
    const shouldEscalate = Boolean(req.body.escalate) && existingConversation?.status !== 'open';

    const conversation = await prisma.chatConversation.upsert({
      where: { tenantId_sessionId: { tenantId: tenant.id, sessionId } },
      create: {
        tenantId: tenant.id,
        sessionId,
        customerId: req.body.customerId ? Number(req.body.customerId) : null,
        customerName: String(req.body.customerName || '').trim().slice(0, 120) || null,
        customerEmail: String(req.body.customerEmail || '').trim().slice(0, 160) || null,
        status: shouldEscalate ? 'requested' : 'bot',
        unreadForAdmin: shouldEscalate
      },
      update: {
        customerId: req.body.customerId ? Number(req.body.customerId) : undefined,
        customerName: String(req.body.customerName || '').trim().slice(0, 120) || undefined,
        customerEmail: String(req.body.customerEmail || '').trim().slice(0, 160) || undefined,
        status: shouldEscalate ? 'requested' : undefined,
        unreadForAdmin: shouldEscalate ? true : undefined
      }
    });
    const message = await prisma.chatMessage.create({
      data: { conversationId: conversation.id, senderType: 'customer', senderId: req.body.customerId ? Number(req.body.customerId) : null, content }
    });
    const updated = await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), ...(shouldEscalate ? { status: 'requested', unreadForAdmin: true } : {}) },
      include: conversationInclude
    });
    const payload = { conversation: updated, message };
    if (updated.status === 'requested' || updated.status === 'open') {
      req.io?.to(`tenant-${tenant.id}-admin`).emit('chat_update', payload);
    }
    req.io?.to(`tenant-${tenant.id}-chat-${sessionId}`).emit('chat_update', payload);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send chat message.' });
  }
});

router.patch('/conversation/read', async (req, res) => {
  try {
    const tenant = await resolveTenant(req);
    const sessionId = sessionValue(req.body.sessionId || req.query.sessionId);
    if (!tenant || !sessionId) return res.status(400).json({ success: false, message: 'A valid chat session is required.' });
    await prisma.chatConversation.updateMany({
      where: { tenantId: tenant.id, sessionId },
      data: { unreadForCustomer: false }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Customer chat read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark chat as read.' });
  }
});

router.get('/admin/conversations', authenticate, authorize('admin'), async (req, res) => {
  try {
    const conversations = await prisma.chatConversation.findMany({
      where: { tenantId: req.tenantId, status: { in: ['requested', 'open'] } },
      include: conversationInclude,
      orderBy: [{ unreadForAdmin: 'desc' }, { updatedAt: 'desc' }]
    });
    res.json({ success: true, data: conversations.map(adminConversationView) });
  } catch (error) {
    console.error('Admin chat list error:', error);
    res.status(500).json({ success: false, message: 'Failed to load customer chats.' });
  }
});

router.patch('/admin/conversations/:id/accept', authenticate, authorize('admin'), async (req, res) => {
  try {
    const conversation = await prisma.chatConversation.findFirst({ where: { id: Number(req.params.id), tenantId: req.tenantId } });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    const updated = await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { status: 'open', adminAcceptedAt: new Date(), unreadForAdmin: false, unreadForCustomer: true },
      include: conversationInclude
    });
    req.io?.to(`tenant-${req.tenantId}-admin`).emit('chat_update', { conversation: adminConversationView(updated), eventType: 'chat_accepted' });
    req.io?.to(`tenant-${req.tenantId}-chat-${conversation.sessionId}`).emit('chat_update', { conversation: updated, eventType: 'chat_accepted' });
    res.json({ success: true, data: adminConversationView(updated) });
  } catch (error) {
    console.error('Admin chat accept error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept chat request.' });
  }
});

router.post('/admin/conversations/:id/messages', authenticate, authorize('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const content = String(req.body.content || '').trim().slice(0, 1000);
    const conversation = await prisma.chatConversation.findFirst({ where: { id, tenantId: req.tenantId } });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    if (conversation.status !== 'open') return res.status(409).json({ success: false, message: 'Accept the chat request before replying.' });
    if (!content) return res.status(400).json({ success: false, message: 'Reply cannot be empty.' });
    const message = await prisma.chatMessage.create({ data: { conversationId: id, senderType: 'admin', senderId: req.user.id, content } });
    const updated = await prisma.chatConversation.update({
      where: { id },
      data: { status: 'open', unreadForAdmin: false, unreadForCustomer: true },
      include: conversationInclude
    });
    req.io?.to(`tenant-${req.tenantId}-admin`).emit('chat_update', { conversation: adminConversationView(updated), message });
    req.io?.to(`tenant-${req.tenantId}-chat-${conversation.sessionId}`).emit('chat_update', { conversation: updated, message });
    res.json({ success: true, data: adminConversationView(updated) });
  } catch (error) {
    console.error('Admin chat reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reply.' });
  }
});

router.patch('/admin/conversations/:id/read', authenticate, authorize('admin'), async (req, res) => {
  try {
    const updated = await prisma.chatConversation.updateMany({ where: { id: Number(req.params.id), tenantId: req.tenantId }, data: { unreadForAdmin: false } });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark chat as read.' });
  }
});

router.patch('/admin/conversations/:id/close', authenticate, authorize('admin'), async (req, res) => {
  try {
    const conversation = await prisma.chatConversation.findFirst({ where: { id: Number(req.params.id), tenantId: req.tenantId } });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });
    const updated = await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { status: 'closed', unreadForAdmin: false, unreadForCustomer: false },
      include: conversationInclude
    });
    const payload = { conversation: updated, eventType: 'chat_closed' };
    req.io?.to(`tenant-${req.tenantId}-admin`).emit('chat_update', payload);
    req.io?.to(`tenant-${req.tenantId}-chat-${conversation.sessionId}`).emit('chat_update', payload);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Admin chat close error:', error);
    res.status(500).json({ success: false, message: 'Failed to end chat.' });
  }
});

module.exports = router;
