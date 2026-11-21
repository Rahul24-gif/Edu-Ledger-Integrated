# Security Specification: EduLedger Integrated Fee Tracker

## 1. Data Invariants
1. **Ownership & Isolation Invariant**: Every `Student` (`/students/{studentId}`) and `Payment` (`/payments/{paymentId}`) document must have `ownerId == request.auth.uid` and can only be read, listed, created, updated, or deleted by its verified owner (`request.auth.token.email_verified == true`).
2. **Relational Consistency Invariant**: A `Payment` cannot be created unless the referenced `/students/{studentId}` exists and is owned by `request.auth.uid`, and the parent student document continues to exist after the batch/write (`existsAfter`).
3. **Cross-Year Academic Year Format Invariant**: `enrollmentAY`, `progressionAY`, and `recordedInAY` must strictly match `^[0-9]{4}-[0-9]{2,4}$` (7 to 9 characters).
4. **Financial Boundary Invariant**: All monetary fields (`classXIFee`, `classXIIFee`, `scholarshipDiscount`, `totalIntegratedFee`, `paidClassXI`, `paidClassXII`, `totalPaid`, `amount`, `allocatedToXI`, `allocatedToXII`) must be non-negative numbers within strict upper bounds (`<= 20000000`), and `amount == allocatedToXI + allocatedToXII`.
5. **Temporal & Immutable Identity Invariant**: `createdAt` must equal `request.time` on `create` and remain immutable on `update`. `updatedAt` must equal `request.time` on both `create` and `update`. `studentId`, `paymentId`, and `ownerId` are immutable after creation.
6. **Terminal State Locking Invariant**: Once a `Student` document reaches `status == 'completed'`, standard profile/fee edits are locked unless explicitly reopening the student status or performed by the verified bootstrapped admin (`mouryar2410@gmail.com`).

## 2. The "Dirty Dozen" Payloads
1. **Payload 1 (Identity Spoofing on Student Create)**: `ownerId: "victim-uid-999"` while authenticated as `"attacker-uid-111"`.
2. **Payload 2 (Shadow / Ghost Field Injection)**: Valid Student payload + `isSuperAdmin: true`.
3. **Payload 3 (Unverified Email Spoof)**: Authenticated user with `email: "mouryar2410@gmail.com"` and `email_verified: false`.
4. **Payload 4 (Path ID Poisoning)**: Creating `/students/invalid..id$$with$$spaces` or >64 character ID.
5. **Payload 5 (Denial of Wallet String Overflow)**: `remarks` field containing a 5,000-character string (exceeds `maxLength: 500`).
6. **Payload 6 (Orphaned Payment Creation)**: Creating a `/payments/{paymentId}` referencing a non-existent `studentId` or a `studentId` owned by another user.
7. **Payload 7 (Update-Gap / Value Poisoning)**: Updating `/students/{studentId}` with `paidClassXI: "not-a-number"` or negative number `-5000`.
8. **Payload 8 (Immortal Field Mutation)**: Updating `createdAt` or `ownerId` on an existing `/students/{studentId}` document.
9. **Payload 9 (Client Timestamp Forgery)**: Creating a student or payment with a forged past/future `createdAt` or `updatedAt` instead of `request.time`.
10. **Payload 10 (Terminal State Bypass)**: Updating `classXIFee` on a student whose existing `status` is `'completed'` without reopening status.
11. **Payload 11 (Cross-Tenant PII Read/List)**: Listing `/students` without `where('ownerId', '==', request.auth.uid)` or reading another user's student record.
12. **Payload 12 (Unbalanced Payment Allocation)**: Creating a payment where `amount: 50000`, `allocatedToXI: 30000`, `allocatedToXII: 30000` (`allocatedToXI + allocatedToXII != amount`).
