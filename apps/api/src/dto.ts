import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(128) password!: string;
}
export class CreateUserDto extends LoginDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @MinLength(12) @MaxLength(128) declare password: string;
  @IsIn(["ADMIN", "ENCODER", "REVIEWER", "READ_ONLY"]) role!: any;
}
export class RoleDto {
  @IsIn(["ADMIN", "ENCODER", "REVIEWER", "READ_ONLY"]) role!: any;
}
export class UploadDto {
  @IsString() @MinLength(1) @MaxLength(255) fileName!: string;
  @IsIn(["application/pdf", "image/jpeg", "image/tiff"]) mimeType!: string;
  @IsInt() @Min(1) @Max(104857600) fileSize!: number;
  @Matches(/^[a-f0-9]{64}$/) checksum!: string;
  @IsOptional() @IsUUID() documentId?: string;
}
export class DocumentDto {
  @IsUUID() uploadId!: string;
  @IsString() @MinLength(1) @MaxLength(250) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(100) documentNumber?: string;
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags!: string[];
  @IsOptional() @IsString() @MaxLength(2000000) ocrText?: string;
  @IsObject() metadata!: Record<string, any>;
  @IsIn(["SCANNER", "UPLOAD"]) source!: string;
}
export class PatchDto {
  @IsOptional()
  @IsIn(["UPLOADED", "IN_REVIEW", "APPROVED", "ARCHIVED"])
  status?: any;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(250) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsObject() metadata?: Record<string, any>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  tags?: string[];
}
export class LogDto {
  @IsIn([
    "SCAN_STARTED",
    "SCAN_COMPLETED",
    "OCR_COMPLETED",
    "PDF_GENERATED",
    "DOCUMENT_UPLOAD_FAILED",
  ])
  action!: string;
  @IsOptional() @IsObject() details?: Record<string, any>;
}
export class CategoryDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
}
