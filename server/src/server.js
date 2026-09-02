import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import http from "http";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "development-secret";

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  },
});

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function cleanUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    lastSeen: user.lastSeen,
  };
}

async function getConversationForUser(conversationId, userId) {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      members: {
        some: { userId },
      },
    },
    include: {
      members: {
        include: {
          user: true,
        },
      },
    },
  });
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
      },
    });

    res.json({
      token: createToken(user),
      user: cleanUser(user),
    });
  } catch {
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() },
    });

    res.json({
      token: createToken(user),
      user: cleanUser(user),
    });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/users/search", auth, async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (!query) return res.json([]);

  const users = await prisma.user.findMany({
    where: {
      id: { not: req.user.id },
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 20,
  });

  res.json(users.map(cleanUser));
});

app.get("/api/conversations", auth, async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: {
      members: {
        some: { userId: req.user.id },
      },
    },
    include: {
      members: {
        include: { user: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(
    conversations.map((conversation) => ({
      ...conversation,
      members: conversation.members.map((member) => ({
        ...member,
        user: cleanUser(member.user),
      })),
    }))
  );
});

app.post("/api/conversations", auth, async (req, res) => {
  const { userId } = req.body;

  if (!userId || userId === req.user.id) {
    return res.status(400).json({ error: "Invalid user" });
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      members: {
        every: {
          userId: { in: [req.user.id, userId] },
        },
      },
    },
    include: {
      members: { include: { user: true } },
    },
  });

  if (existing && existing.members.length === 2) {
    return res.json(existing);
  }

  const conversation = await prisma.conversation.create({
    data: {
      members: {
        create: [{ userId: req.user.id }, { userId }],
      },
    },
    include: {
      members: {
        include: { user: true },
      },
    },
  });

  res.json(conversation);
});

app.get("/api/conversations/:id/messages", auth, async (req, res) => {
  const conversation = await getConversationForUser(
    req.params.id,
    req.user.id
  );

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    include: {
      sender: true,
    },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.updateMany({
    where: {
      conversationId: req.params.id,
      senderId: { not: req.user.id },
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  res.json(
    messages.map((message) => ({
      ...message,
      sender: cleanUser(message.sender),
    }))
  );
});

app.post("/api/conversations/:id/messages", auth, async (req, res) => {
  const { body } = req.body;

  if (!body?.trim()) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }

  const conversation = await getConversationForUser(
    req.params.id,
    req.user.id
  );

  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  const message = await prisma.message.create({
    data: {
      body: body.trim(),
      senderId: req.user.id,
      conversationId: req.params.id,
    },
    include: {
      sender: true,
    },
  });

  const result = {
    ...message,
    sender: cleanUser(message.sender),
  };

  io.to(`conversation:${req.params.id}`).emit("new_message", result);

  res.json(result);
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", async (socket) => {
  const userId = socket.user.id;

  await prisma.user.update({
    where: { id: userId },
    data: { lastSeen: new Date() },
  });

  socket.on("join_conversation", (conversationId) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on("leave_conversation", (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
  });

  socket.on("typing", ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit("typing", {
      userId,
      conversationId,
    });
  });

  socket.on("stop_typing", ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit("stop_typing", {
      userId,
      conversationId,
    });
  });

  socket.on("disconnect", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeen: new Date() },
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
