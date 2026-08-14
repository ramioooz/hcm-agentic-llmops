import { extname, relative, sep } from 'node:path';

const mediaTypes = new Map([
  ['.pdf', 'application/pdf'],
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.markdown', 'text/markdown'],
]);

export function knowledgeMediaType(filePath: string): string | undefined {
  return mediaTypes.get(extname(filePath).toLowerCase());
}

export function normalizedSourcePath(repositoryRoot: string, filePath: string): string {
  const sourcePath = relative(repositoryRoot, filePath).split(sep).join('/');
  if (!sourcePath || sourcePath === '..' || sourcePath.startsWith('../')) {
    throw new Error('KNOWLEDGE_SOURCE_PATH_INVALID');
  }
  return sourcePath;
}

export function knowledgeTitle(fileName: string): string {
  const title = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title ? title.replace(/\b\w/g, (character) => character.toUpperCase()) : 'Knowledge Document';
}
