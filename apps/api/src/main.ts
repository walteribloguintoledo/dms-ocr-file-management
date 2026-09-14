import "reflect-metadata";
import { AuthGuard } from "./auth.guard";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../../../.env.local") });
config({ path: resolve(__dirname, "../../../.env") });
config();
import { NestFactory, Reflector, APP_GUARD } from "@nestjs/core";
import {
  BadRequestException,
  Body,
  CanActivate,
  ConflictException,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  ServiceUnavailableException,
  ValidationPipe,
} from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule, Throttle } from "@nestjs/throttler";
import { PrismaClient, Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json } from "express";
import type { Response } from "express";
import {
  CategoryDto,
  CreateUserDto,
  DocumentDto,
  LoginDto,
  LogDto,
  PatchDto,
  RoleDto,
  UploadDto,
} from "./dto";
import {
  canRead,
  canTransition,
  matchesMagic,
  validateFile,
  Role,
} from "./policy";
const production = process.env.NODE_ENV === "production";
for (const key of [
  "DATABASE_URL",
  "JWT_SECRET",
  "WEB_ORIGIN",
  ...(production ? ["S3_BUCKET", "AWS_REGION"] : []),
])
  if (!process.env[key])
    throw new Error(`Missing required environment variable: ${key}`);
if (process.env.JWT_SECRET!.length < 32)
  throw new Error("JWT_SECRET must be at least 32 characters.");
const origins = process.env.WEB_ORIGIN!.split(",").map((s) => s.trim());
if (production && origins.some((s) => !s.startsWith("https://")))
  throw new Error("Production web origins must use HTTPS.");
const prisma = new PrismaClient(),
  bucket = process.env.S3_BUCKET!;
const storageConfigured = Boolean(bucket?.trim() && process.env.AWS_REGION?.trim());
let storageClient: S3Client | undefined;
function requireStorage() {
  if (!storageConfigured) throw new ServiceUnavailableException(
    "Document storage is not configured. Set S3_BUCKET and AWS_REGION in the API environment and restart the API.",
  );
  return storageClient ??= new S3Client({ region: process.env.AWS_REGION });
}
const maxSize = Math.min(
  104857600,
  Number(process.env.MAX_FILE_SIZE_MB || 50) * 1048576,
);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const Public = () => SetMetadata("public", true),
  Roles = (...roles: Role[]) => SetMetadata("roles", roles);
const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: 7 * 86400000,
};
const audit = (
  actorId: string,
  action: string,
  details: any = {},
  documentId?: string,
) =>
  prisma.auditEvent.create({ data: { actorId, action, details, documentId } });
function checkMetadata(metadata: Record<string, any>) {
  if (
    Object.keys(metadata).length > 30 ||
    JSON.stringify(metadata).length > 16000
  )
    throw new BadRequestException("Metadata is too large.");
  for (const [key, value] of Object.entries(metadata))
    if (
      key.length > 100 ||
      !["string", "number", "boolean"].includes(typeof value)
    )
      throw new BadRequestException(
        "Metadata values must be strings, numbers, or booleans.",
      );
  if (
    metadata.confidentiality &&
    !["Public", "Internal", "Confidential", "Restricted"].includes(
      metadata.confidentiality,
    )
  )
    throw new BadRequestException("Invalid confidentiality.");
}
@Injectable()
class AuthService {
  constructor(private readonly jwt: JwtService) {}
  async issue(user: any, res: Response, tx: any = prisma) {
    const refresh = randomBytes(48).toString("base64url");
    const session = await tx.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: digest(refresh),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id },
      { expiresIn: "15m" },
    );
    res.cookie("dms_refresh", refresh, cookieOptions);
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
@Controller("auth")
class AuthController {
  constructor(private readonly auth: AuthService, private readonly jwt: JwtService) {}
  @Get("scanner")
  @Roles("ADMIN", "ENCODER")
  scannerAccess() {
    return { allowed: true };
  }
  @Public()
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await prisma.user.findUnique({
      where: { email: body.email.trim().toLowerCase() },
    });
    if (!user?.active || !(await compare(body.password, user.passwordHash)))
      throw new UnauthorizedException("Invalid email or password.");
    return prisma.$transaction(async (tx) => {
      await tx.auditEvent.create({
        data: { actorId: user.id, action: "USER_LOGIN" },
      });
      return this.auth.issue(user, res, tx);
    });
  }
  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies.dms_refresh;
    if (!token) throw new UnauthorizedException();
    return prisma.$transaction(async (tx) => {
      const session = await tx.refreshSession.findUnique({
        where: { tokenHash: digest(token) },
        include: { user: true },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt < new Date() ||
        !session.user.active
      )
        throw new UnauthorizedException();
      const used = await tx.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (used.count !== 1) throw new UnauthorizedException();
      return this.auth.issue(session.user, res, tx);
    });
  }
  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const { maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie("dms_refresh", clearOptions);
    const proofs: Prisma.RefreshSessionWhereInput[] = [];
    if (req.cookies.dms_refresh) proofs.push({tokenHash: digest(req.cookies.dms_refresh)});
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) {
      try {
        // An expired, correctly signed token can revoke its session, never authorize access.
        const payload = await this.jwt.verifyAsync(bearer, {ignoreExpiration: true});
        if (typeof payload.sid === "string" && typeof payload.sub === "string") proofs.push({id:payload.sid,userId:payload.sub});
      } catch {}
    }
    if (proofs.length) await prisma.$transaction(async tx => {
      const sessions = await tx.refreshSession.findMany({where:{OR:proofs,revokedAt:null},select:{id:true,userId:true}});
      for (const session of sessions) {
        const revoked=await tx.refreshSession.updateMany({where:{id:session.id,revokedAt:null},data:{revokedAt:new Date()}});
        if (revoked.count) await tx.auditEvent.create({data:{actorId:session.userId,action:"USER_LOGOUT"}});
      }
    });
    return {ok:true};
  }

}
async function getDocument(id: string, user: any) {
  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
  });
  if (!doc || !canRead(user.role, user.id, doc))
    throw new NotFoundException("Document not found.");
  return doc;
}
const readableWhere = (u: any): Prisma.DocumentWhereInput =>
  ["ADMIN", "REVIEWER"].includes(u.role)
    ? { deletedAt: null }
    : {
        deletedAt: null,
        OR: [
          { createdBy: u.id },
          {
            NOT: {
              metadata: { path: ["confidentiality"], equals: "Confidential" },
            },
            AND: [
              {
                NOT: {
                  metadata: { path: ["confidentiality"], equals: "Restricted" },
                },
              },
            ],
          },
        ],
      };
@Controller("documents")
class DocumentController {
  @Get() async list(
    @Req() req: any,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("categoryId") categoryId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const clauses: Prisma.DocumentWhereInput[] = [readableWhere(req.user)];
    if (q)
      clauses.push({
        OR: [
          "title",
          "employeeId",
          "employeeName",
          "documentNumber",
          "ocrText",
        ].map((field) => ({ [field]: { contains: q, mode: "insensitive" } })),
      });
    if (status) {
      if (!["UPLOADED", "IN_REVIEW", "APPROVED", "ARCHIVED"].includes(status))
        throw new BadRequestException("Invalid status.");
      clauses.push({ status: status as any });
    }
    if (categoryId) clauses.push({ categoryId });
    if (from || to) {
      if ((from && isNaN(Date.parse(from))) || (to && isNaN(Date.parse(to))))
        throw new BadRequestException("Invalid date.");
      clauses.push({
        createdAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      });
    }
    return prisma.document.findMany({
      where: { AND: clauses },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }
  @Post("upload-url")
  @Roles("ADMIN", "ENCODER")
  async presign(@Req() req: any, @Body() body: UploadDto) {
    requireStorage();
    if (!validateFile(body.fileName, body.mimeType, body.fileSize, maxSize))
      throw new BadRequestException(
        "File extension, MIME type, or size is not allowed.",
      );
    if (body.documentId) {
      const doc = await getDocument(body.documentId, req.user);
      if (doc.status === "ARCHIVED")
        throw new ConflictException(
          "Archived documents cannot receive new versions.",
        );
    }
    const key = `staging/${req.user.id}/${randomUUID()}`;
    const session = await prisma.$transaction(async (tx) => {
      const upload = await tx.uploadSession.create({
        data: {
          userId: req.user.id,
          documentId: body.documentId,
          s3Key: key,
          fileName: body.fileName,
          mimeType: body.mimeType,
          fileSize: body.fileSize,
          checksum: body.checksum,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.user.id,
          action: "DOCUMENT_UPLOAD_STARTED",
          details: { uploadId: upload.id, fileName: body.fileName },
        },
      });
      return upload;
    });
    const checksum64 = Buffer.from(body.checksum, "hex").toString("base64");
    const url = await getSignedUrl(
      requireStorage(),
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: body.mimeType,
        ContentLength: body.fileSize,
        ChecksumSHA256: checksum64,
        ServerSideEncryption: "AES256",
      }),
      { expiresIn: 300 },
    );
    return {
      uploadId: session.id,
      url,
      headers: {
        "Content-Type": body.mimeType,
        "x-amz-checksum-sha256": checksum64,
        "x-amz-server-side-encryption": "AES256",
      },
    };
  }
  async finalize(req: any, body: DocumentDto, documentId?: string) {
    requireStorage();
    checkMetadata(body.metadata);
    const existing = await prisma.documentVersion.findUnique({
      where: { uploadId: body.uploadId },
      include: { document: true },
    });
    if (existing) {
      if (
        existing.createdBy !== req.user.id ||
        existing.documentId !== (documentId || existing.documentId)
      )
        throw new ForbiddenException();
      return getDocument(existing.documentId, req.user);
    }
    const upload = await prisma.uploadSession.findUnique({
      where: { id: body.uploadId },
    });
    if (
      !upload ||
      upload.userId !== req.user.id ||
      upload.completedAt ||
      upload.expiresAt < new Date() ||
      upload.documentId !== (documentId || null)
    )
      throw new BadRequestException("Invalid or expired upload session.");
    if (documentId) await getDocument(documentId, req.user);
    const head = await requireStorage().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: upload.s3Key,
        ChecksumMode: "ENABLED",
      }),
    );
    if (
      head.ContentLength !== upload.fileSize ||
      head.ContentType !== upload.mimeType ||
      head.ChecksumSHA256 !==
        Buffer.from(upload.checksum, "hex").toString("base64")
    )
      throw new BadRequestException(
        "Uploaded file size, type, or checksum does not match.",
      );
    if (!head.VersionId || head.VersionId === "null")
      throw new BadRequestException(
        "Enable S3 bucket versioning before accepting documents.",
      );
    const object = await requireStorage().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: upload.s3Key,
        VersionId: head.VersionId,
        Range: "bytes=0-15",
      }),
    );
    const firstBytes = await object.Body!.transformToByteArray();
    if (!matchesMagic(firstBytes, upload.mimeType))
      throw new BadRequestException(
        "The file contents do not match its declared type.",
      );
    const key = `documents/${req.user.id}/${upload.id}`;
    const copied = await requireStorage().send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: `${bucket}/${upload.s3Key}?versionId=${encodeURIComponent(head.VersionId)}`,
        MetadataDirective: "COPY",
        ServerSideEncryption: "AES256",
      }),
    );
    try {
      return await prisma.$transaction(
        async (tx) => {
          const claimed = await tx.uploadSession.updateMany({
            where: { id: upload.id, completedAt: null },
            data: { completedAt: new Date() },
          });
          if (claimed.count !== 1)
            throw new ConflictException("Upload already finalized.");
          let doc;
          if (documentId) {
            const current = await tx.document.findFirst({
              where: { id: documentId, deletedAt: null },
            });
            if (!current) throw new NotFoundException();
            if (current.status === "ARCHIVED")
              throw new ConflictException(
                "Archived documents cannot receive new versions.",
              );
            doc = await tx.document.update({
              where: { id: documentId },
              data: {
                s3Key: key,
                mimeType: upload.mimeType,
                fileSize: upload.fileSize,
                checksum: upload.checksum,
                ocrText: body.ocrText || "",
                status: "UPLOADED",
              },
            });
          } else {
            doc = await tx.document.create({
              data: {
                title: body.title.trim(),
                description: body.description,
                documentNumber: body.documentNumber || undefined,
                categoryId: body.categoryId,
                employeeId: body.employeeId,
                employeeName: body.employeeName,
                source: body.source,
                mimeType: upload.mimeType,
                fileSize: upload.fileSize,
                s3Key: key,
                checksum: upload.checksum,
                ocrText: body.ocrText,
                tags: body.tags,
                metadata: body.metadata,
                createdBy: req.user.id,
              },
            });
            if (!body.documentNumber)
              doc = await tx.document.update({
                where: { id: doc.id },
                data: {
                  documentNumber: `DOC-${doc.createdAt.getUTCFullYear()}-${String(doc.sequence).padStart(6, "0")}`,
                },
              });
          }
          const last = await tx.documentVersion.aggregate({
            where: { documentId: doc.id },
            _max: { version: true },
          });
          await tx.documentVersion.create({
            data: {
              documentId: doc.id,
              version: (last._max.version || 0) + 1,
              s3Key: key,
              s3VersionId: copied.VersionId,
              mimeType: upload.mimeType,
              fileSize: upload.fileSize,
              checksum: upload.checksum,
              ocrText: body.ocrText || "",
              createdBy: req.user.id,
              uploadId: upload.id,
            },
          });
          await tx.auditEvent.create({
            data: {
              actorId: req.user.id,
              documentId: doc.id,
              action: "DOCUMENT_UPLOADED",
              details: {
                checksum: upload.checksum,
                version: (last._max.version || 0) + 1,
              },
            },
          });
          return doc;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (e: any) {
      if (e.code === "P2002" || e.code === "P2034")
        throw new ConflictException(
          "Concurrent update or duplicate document number. Retry the operation.",
        );
      throw e;
    }
  }
  @Post() @Roles("ADMIN", "ENCODER") async create(
    @Req() req: any,
    @Body() body: DocumentDto,
  ) {
    return this.finalize(req, body);
  }
  @Post(":id/versions") @Roles("ADMIN", "ENCODER") async version(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: DocumentDto,
  ) {
    return this.finalize(req, body, id);
  }
  @Get(":id/download") async download(
    @Req() req: any,
    @Param("id") id: string,
    @Query("inline") inline?: string,
    @Query("version") version?: string,
  ) {
    requireStorage();
    const doc = await getDocument(id, req.user);
    const v = await prisma.documentVersion.findFirst({
      where: {
        documentId: id,
        ...(version ? { version: Number(version) } : {}),
      },
      orderBy: { version: "desc" },
    });
    if (!v) throw new NotFoundException();
    await audit(req.user.id, "DOCUMENT_DOWNLOADED", { version: v.version }, id);
    const name = doc.documentNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    const extension =
      v.mimeType === "application/pdf"
        ? "pdf"
        : v.mimeType === "image/tiff"
          ? "tiff"
          : "jpg";
    return {
      url: await getSignedUrl(
        requireStorage(),
        new GetObjectCommand({
          Bucket: bucket,
          Key: v.s3Key,
          VersionId: v.s3VersionId || undefined,
          ResponseContentDisposition: `${inline === "true" ? "inline" : "attachment"}; filename="${name}.${extension}"`,
          ResponseContentType: v.mimeType,
        }),
        { expiresIn: 60 },
      ),
    };
  }
  @Get(":id") async get(@Req() req: any, @Param("id") id: string) {
    await getDocument(id, req.user);
    return prisma.document.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { version: "desc" } },
        audits: {
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }
  @Patch(":id") async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: PatchDto,
  ) {
    if (body.metadata) checkMetadata(body.metadata);
    return prisma.$transaction(
      async (tx) => {
        const doc = await tx.document.findFirst({
          where: { id, deletedAt: null },
        });
        if (!doc || !canRead(req.user.role, req.user.id, doc))
          throw new NotFoundException();
        if (body.status) {
          if (!canTransition(req.user.role, doc.status, body.status))
            throw new ForbiddenException(
              "This workflow transition is not permitted.",
            );
          if (Object.keys(body).some((k) => k !== "status"))
            throw new BadRequestException(
              "Submit metadata changes separately from workflow changes.",
            );
        } else if (
          !["ADMIN", "ENCODER"].includes(req.user.role) ||
          doc.status === "ARCHIVED"
        )
          throw new ForbiddenException("Document metadata cannot be edited.");
        const updated = await tx.document.update({
          where: { id },
          data: {
            ...body,
            ...(!body.status ? { status: "UPLOADED" as const } : {}),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: req.user.id,
            documentId: id,
            action: body.status
              ? `DOCUMENT_${body.status}`
              : "DOCUMENT_METADATA_UPDATED",
            details: { previousStatus: doc.status, ...body },
          },
        });
        return updated;
      },
      { isolationLevel: "Serializable" },
    );
  }
  @Delete(":id") @Roles("ADMIN") async remove(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    await getDocument(id, req.user);
    await prisma.$transaction([
      prisma.document.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      prisma.auditEvent.create({
        data: {
          actorId: req.user.id,
          documentId: id,
          action: "DOCUMENT_DELETED",
        },
      }),
    ]);
    return { ok: true };
  }
}
@Controller()
class WorkspaceController {
  @Public() @Get("health") health() {
    return { status: "ok", service: "folio-dms-api", storageConfigured };
  }
  @Get("dashboard") async dashboard(@Req() req: any) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const where = readableWhere(req.user);
    const [docs, scans, uploads] = await Promise.all([
      prisma.document.findMany({
        where,
        select: { metadata: true, fileSize: true },
      }),
      prisma.auditEvent.count({
        where: {
          action: "SCAN_COMPLETED",
          createdAt: { gte: start },
          ...(!["ADMIN", "REVIEWER"].includes(req.user.role)
            ? { actorId: req.user.id }
            : {}),
        },
      }),
      prisma.document.count({
        where: { AND: [where, { createdAt: { gte: start } }] },
      }),
    ]);
    return {
      todayScans: scans,
      todayUploads: uploads,
      totalPages: docs.reduce(
        (n, d) => n + (Number((d.metadata as any)?.pageCount) || 0),
        0,
      ),
      totalBytes: docs.reduce((n, d) => n + d.fileSize, 0),
    };
  }
  @Get("logs") async logs(@Req() req: any) {
    return prisma.auditEvent.findMany({
      where: ["ADMIN", "REVIEWER"].includes(req.user.role)
        ? {}
        : { actorId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { actor: { select: { name: true } } },
    });
  }
  @Post("logs") @Roles("ADMIN", "ENCODER") async log(
    @Req() req: any,
    @Body() body: LogDto,
  ) {
    if (JSON.stringify(body.details || {}).length > 4000)
      throw new BadRequestException("Event details are too large.");
    return audit(req.user.id, body.action, {
      ...body.details,
      source: "client-reported",
    });
  }
  @Get("categories") categories() {
    return prisma.category.findMany({ orderBy: { name: "asc" } });
  }
  @Post("categories") @Roles("ADMIN") category(@Body() body: CategoryDto) {
    return prisma.category.create({ data: body });
  }
  @Get("users") @Roles("ADMIN") users() {
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }
  @Post("users") @Roles("ADMIN") async createUser(
    @Req() req: any,
    @Body() body: CreateUserDto,
  ) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          role: body.role,
          passwordHash: await hash(body.password, 12),
        },
        select: { id: true, name: true, email: true, role: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.user.id,
          action: "USER_CREATED",
          details: { userId: user.id, role: user.role },
        },
      });
      return user;
    });
  }
  @Patch("users/:id") @Roles("ADMIN") async updateUser(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: RoleDto,
  ) {
    if (id === req.user.id)
      throw new BadRequestException("You cannot change your own role.");
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { role: body.role },
        select: { id: true, name: true, email: true, role: true },
      });
      await tx.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.user.id,
          action: "USER_ROLE_CHANGED",
          details: { userId: id, role: body.role },
        },
      });
      return user;
    });
  }
}
@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [AuthController, DocumentController, WorkspaceController],
  providers: [
    AuthService,
    { provide: "SESSION_STORE", useValue: prisma },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: "3mb" }));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });
  app.use((req: any, res: any, next: any) => {
    if (
      production &&
      !req.secure &&
      req.headers["x-forwarded-proto"] !== "https"
    )
      return res.status(400).json({ message: "HTTPS is required." });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!req.headers.origin || !origins.includes(req.headers.origin))
    )
      return res.status(403).json({ message: "Untrusted request origin." });
    next();
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.PORT || 4000),
    process.env.HOST || "127.0.0.1",
  );
}
void bootstrap();
