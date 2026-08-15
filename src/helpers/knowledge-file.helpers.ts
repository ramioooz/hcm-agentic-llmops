import { extname, relative, sep } from 'node:path';
import { KnowledgeErrorCode } from '../enums/error.enum';
import { ApplicationError } from '../errors/application.error';

const PDF_MEDIA_TYPE = 'application/pdf';

export function knowledgeMediaType(filePath: string): string | undefined {
  return extname(filePath).toLowerCase() === '.pdf' ? PDF_MEDIA_TYPE : undefined;
}

export function normalizedSourcePath(repositoryRoot: string, filePath: string): string {
  const sourcePath = relative(repositoryRoot, filePath).split(sep).join('/');
  if (!sourcePath || sourcePath === '..' || sourcePath.startsWith('../')) {
    throw new ApplicationError(KnowledgeErrorCode.SourcePathInvalid);
  }
  return sourcePath;
}

export function knowledgeTitle(fileName: string): string {
  const title = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title
    ? title.replace(/\b\w/g, (character) => character.toUpperCase())
    : 'Knowledge Document';
}
