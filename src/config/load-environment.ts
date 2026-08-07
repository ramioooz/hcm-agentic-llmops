import 'dotenv/config';
import { parseEnvironment } from './environment';

export function loadEnvironment() {
  return parseEnvironment(process.env);
}
