-- CreateTable
CREATE TABLE "DmReadState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "lastReadAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageId" TEXT,
    CONSTRAINT "DmReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DmReadState_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DirectMessageThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DmReadState_threadId_idx" ON "DmReadState"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "DmReadState_userId_threadId_key" ON "DmReadState"("userId", "threadId");
