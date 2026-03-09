#!/usr/bin/env node
import { Command } from 'commander';
import { transcribe } from './commands/transcribe.js';
import { generateSubtitles } from './commands/generate-subtitles.js';
import { applyEdits } from './commands/apply-edits.js';
import { reviewServer } from './commands/review-server.js';
import { cutVideo } from './commands/cut-video.js';

const program = new Command();

program
  .name('videocut')
  .description('Video clipping CLI tool for podcast videos')
  .version('1.0.0');

program
  .command('transcribe <video>')
  .description('Transcribe video using Volcengine API')
  .option('-o, --output <dir>', 'Output directory')
  .action(transcribe);

program
  .command('generate-subtitles <json>')
  .description('Generate subtitles structure from transcription')
  .option('-o, --output <file>', 'Output file path')
  .action(generateSubtitles);

program
  .command('apply-edits <subtitles> <edits>')
  .description('Apply edits to subtitles')
  .option('-o, --output <file>', 'Output file path')
  .action(applyEdits);

program
  .command('review-server [port]')
  .description('Start review server')
  .option('-p, --path <path>', 'Root path for projects')
  .action(reviewServer);

program
  .command('cut <video> <segments>')
  .description('Cut video based on delete segments')
  .option('-o, --output <file>', 'Output video path')
  .option('--project <path>', 'Project path for audio offset')
  .action(cutVideo);

program.parse();
