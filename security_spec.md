# Security Specification — Moaskar Moghlaq

## 1. Data Invariants
1. **Strict 2-Student Camp Capacity**: A `/camps/{campId}` document can have at most `memberCount == 2` (`member1Uid` and `member2Uid`). No third user can join or read a full camp.
2. **Dual-Completion Isolation**: In `/camps/{campId}/tasks/{taskId}`, Student 1 (`member1Uid`) can ONLY modify `member1Done` and `member1DoneAtMs`, and Student 2 (`member2Uid`) can ONLY modify `member2Done` and `member2DoneAtMs`. Neither can overwrite the other's progress.
3. **Owner-Only Task Governance**: Only `camp.ownerUid` can create, edit metadata of, or delete tasks inside `/camps/{campId}/tasks/{taskId}`.
4. **Master Gate Isolation**: Every subcollection under `/camps/{campId}/...` verifies parent camp membership via `get(/databases/$(database)/documents/camps/$(campId))`. Non-members receive `PERMISSION_DENIED`.
5. **PII & Profile Isolation**: `/userProfiles/{userId}` can only be read or written by `request.auth.uid == userId`; listing `/userProfiles` and `/inviteCodes` is denied.
6. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation/update; `createdAt`, `id`, `campId`, `ownerUid`, and `member1Uid` are immutable.
7. **Atomic Invite Join**: Updating `/inviteCodes/{code}` to `isFull: true` requires `getAfter(/databases/$(database)/documents/camps/$(campId)).data.member2Uid == request.auth.uid`.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read of `/camps/{campId}`
2. Third user attempting `get` or `list` on an active 2-member camp
3. Third user attempting `JoinCamp` when `memberCount == 2`
4. Student 1 attempting to toggle `member2Done` on `/camps/{campId}/tasks/{taskId}`
5. Student 2 attempting to toggle `member1Done` on `/camps/{campId}/tasks/{taskId}`
6. Student 2 attempting to delete a task created by owner in `/camps/{campId}/tasks/{taskId}`
7. Member sending a message with spoofed `senderUid != request.auth.uid`
8. Non-member attempting to list `/camps/{campId}/messages`
9. Shadow update injecting ghost field `isAdmin: true` on `/camps/{campId}` or `/userProfiles/{uid}`
10. Oversized 10KB string injected into `title` or document ID `{taskId}`
11. Spoofed client timestamp `createdAt != request.time`
12. Listing `/inviteCodes` or `/userProfiles` to scrape user/camp metadata
