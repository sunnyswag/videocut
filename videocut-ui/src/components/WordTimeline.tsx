import React, { memo } from 'react';
import type { Word } from '../types';

interface WordItemProps {
  word: Word;
  index: number;
  isGap: boolean;
  isSelected: boolean;
  isAuto: boolean;
  isCurrent: boolean;
  wordRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  onWordClick: (word: Word) => void;
  onToggleWord: (index: number) => void;
  onWordMouseDown: (e: React.MouseEvent, index: number) => void;
  onWordMouseEnter: (index: number) => void;
}

const WordItem = memo<WordItemProps>(
  ({
    word,
    index,
    isGap,
    isSelected,
    isAuto,
    isCurrent,
    wordRefs,
    onWordClick,
    onToggleWord,
    onWordMouseDown,
    onWordMouseEnter,
  }) => {
    const className = `${isGap ? 'gap' : 'word'} ${isSelected ? 'selected' : ''} ${!isSelected && isAuto ? 'ai-selected' : ''} ${isCurrent ? 'current' : ''}`.trim();

    return (
      <div
        ref={(el) => {
          wordRefs.current[index] = el;
        }}
        className={className}
        onClick={() => onWordClick(word)}
        onDoubleClick={() => onToggleWord(index)}
        onMouseDown={(e) => onWordMouseDown(e, index)}
        onMouseEnter={() => onWordMouseEnter(index)}
      >
        {isGap ? `⏸ ${(word.end - word.start).toFixed(1)}s` : word.text}
      </div>
    );
  },
  (prev, next) =>
    prev.word === next.word &&
    prev.isSelected === next.isSelected &&
    prev.isAuto === next.isAuto &&
    prev.isCurrent === next.isCurrent
);

interface WordTimelineProps {
  words: Word[];
  selected: Set<number>;
  autoSelected: Set<number>;
  currentWordIndex: number;
  wordRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  onWordClick: (word: Word) => void;
  onToggleWord: (index: number) => void;
  onWordMouseDown: (e: React.MouseEvent, index: number) => void;
  onWordMouseEnter: (index: number) => void;
}

export function WordTimeline({
  words,
  selected,
  autoSelected,
  currentWordIndex,
  wordRefs,
  onWordClick,
  onToggleWord,
  onWordMouseDown,
  onWordMouseEnter,
}: WordTimelineProps) {
  return (
    <div className="content">
      {words.map((word, i) => (
        <WordItem
          key={i}
          word={word}
          index={i}
          isGap={!word.text || word.opt === 'blank'}
          isSelected={selected.has(i)}
          isAuto={autoSelected.has(i)}
          isCurrent={i === currentWordIndex}
          wordRefs={wordRefs}
          onWordClick={onWordClick}
          onToggleWord={onToggleWord}
          onWordMouseDown={onWordMouseDown}
          onWordMouseEnter={onWordMouseEnter}
        />
      ))}
    </div>
  );
}
