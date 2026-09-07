import { describe, it, expect } from 'vitest';
import {
  chess, legalMoves, inCheck, isAttacked, startingSquares,
  insufficientMaterial, squareName, colourOf, WHITE, BLACK,
} from '../games/chess';
import type { ChessBoard, Game } from '../games/types';
import { ENGINES } from '../games';

/** a8 = 0 ... h1 = 63, matching the engine's indexing. */
function sq(name: string): number {
  const file = 'abcdefgh'.indexOf(name[0]);
  const rank = Number(name[1]);
  return (8 - rank) * 8 + file;
}

function board(over: Partial<ChessBoard> = {}): ChessBoard {
  return {
    kind: 'chess', squares: startingSquares(), castling: 'KQkq',
    enPassant: null, halfmove: 0, check: false, lastMove: null, ...over,
  };
}

/** An empty board with the given pieces, e.g. { e1: 'K', e8: 'k' }. */
function position(pieces: Record<string, string>, over: Partial<ChessBoard> = {}): ChessBoard {
  const squares: (string | null)[] = Array(64).fill(null);
  for (const [name, piece] of Object.entries(pieces)) squares[sq(name)] = piece;
  return board({ squares, castling: '-', ...over });
}

function game(b: ChessBoard, turn = 0): Game {
  return {
    id: 'g', kind: 'chess',
    players: [
      { uid: 'w', name: 'White', color: '#fff', seat: 0 },
      { uid: 'b', name: 'Black', color: '#000', seat: 1 },
    ],
    seats: 2, turn, status: 'active', winner: null, board: b,
    createdAt: 0, updatedAt: 0, version: 1, note: '', openedBy: 'w',
  };
}

describe('board geometry', () => {
  it('names squares the way a player reads them', () => {
    expect(squareName(0)).toBe('a8');
    expect(squareName(63)).toBe('h1');
    expect(squareName(sq('e4'))).toBe('e4');
  });

  it('sets up the standard position', () => {
    const s = startingSquares();
    expect(s[sq('e1')]).toBe('K');
    expect(s[sq('e8')]).toBe('k');
    expect(s[sq('a1')]).toBe('R');
    expect(s[sq('d8')]).toBe('q');
    expect(colourOf('K')).toBe(WHITE);
    expect(colourOf('k')).toBe(BLACK);
  });

  it('offers exactly twenty opening moves for each side', () => {
    expect(legalMoves(board(), WHITE)).toHaveLength(20);
    expect(legalMoves(board(), BLACK)).toHaveLength(20);
  });
});

describe('pawns', () => {
  it('may advance two squares only from its home rank', () => {
    const b = board();
    const moves = legalMoves(b, WHITE).filter((m) => m.from === sq('e2'));
    expect(moves.map((m) => squareName(m.to)).sort()).toEqual(['e3', 'e4']);
  });

  it('captures diagonally but never straight ahead', () => {
    const b = position({ e1: 'K', e8: 'k', e4: 'P', e5: 'p', d5: 'p' });
    const targets = legalMoves(b, WHITE)
      .filter((m) => m.from === sq('e4'))
      .map((m) => squareName(m.to));
    expect(targets).toContain('d5');   // capture
    expect(targets).not.toContain('e5'); // blocked head-on
  });

  it('captures en passant and removes the passed pawn', () => {
    const b = position(
      { e1: 'K', e8: 'k', e5: 'P', d5: 'p' },
      { enPassant: sq('d6') }
    );
    const r = chess.apply(game(b), WHITE, { from: sq('e5'), to: sq('d6') });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'chess') return;
    expect(r.game.board.squares[sq('d6')]).toBe('P');
    expect(r.game.board.squares[sq('d5')]).toBeNull(); // the captured pawn is gone
  });

  it('promotes, honouring the requested piece', () => {
    const b = position({ e1: 'K', a8: 'k', b7: 'P' });
    const r = chess.apply(game(b), WHITE, { from: sq('b7'), to: sq('b8'), promo: 'n' });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'chess') return;
    expect(r.game.board.squares[sq('b8')]).toBe('N');
  });

  it('defaults an unknown promotion choice to a queen', () => {
    const b = position({ e1: 'K', a8: 'k', b7: 'P' });
    const r = chess.apply(game(b), WHITE, { from: sq('b7'), to: sq('b8'), promo: 'zzz' });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'chess') return;
    expect(r.game.board.squares[sq('b8')]).toBe('Q');
  });
});

describe('castling', () => {
  it('moves the rook alongside the king', () => {
    const b = position({ e1: 'K', h1: 'R', e8: 'k' }, { castling: 'K' });
    const r = chess.apply(game(b), WHITE, { from: sq('e1'), to: sq('g1') });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'chess') return;
    expect(r.game.board.squares[sq('g1')]).toBe('K');
    expect(r.game.board.squares[sq('f1')]).toBe('R');
    expect(r.game.board.squares[sq('h1')]).toBeNull();
  });

  it('is refused through an attacked square', () => {
    // A black rook on f8 covers f1, the square the king would cross.
    const b = position({ e1: 'K', h1: 'R', e8: 'k', f8: 'r' }, { castling: 'K' });
    const targets = legalMoves(b, WHITE).filter((m) => m.from === sq('e1')).map((m) => m.to);
    expect(targets).not.toContain(sq('g1'));
  });

  it('is refused while in check', () => {
    const b = position({ e1: 'K', h1: 'R', e8: 'r' }, { castling: 'K' });
    expect(inCheck(b.squares, WHITE)).toBe(true);
    const targets = legalMoves(b, WHITE).filter((m) => m.from === sq('e1')).map((m) => m.to);
    expect(targets).not.toContain(sq('g1'));
  });

  it('is refused across an occupied square', () => {
    const b = position({ e1: 'K', h1: 'R', g1: 'N', e8: 'k' }, { castling: 'K' });
    const targets = legalMoves(b, WHITE).filter((m) => m.from === sq('e1')).map((m) => m.to);
    expect(targets).not.toContain(sq('g1'));
  });

  it('loses the right once the king has moved', () => {
    const b = position({ e1: 'K', h1: 'R', e8: 'k' }, { castling: 'KQ' });
    const r = chess.apply(game(b), WHITE, { from: sq('e1'), to: sq('e2') });
    expect(r.ok).toBe(true);
    if (!r.ok || r.game.board.kind !== 'chess') return;
    expect(r.game.board.castling).toBe('-');
  });
});

describe('check, mate and stalemate', () => {
  it('will not allow a move that leaves the king in check', () => {
    // The d2 knight is pinned against its own king by the rook on d8.
    const pinned = position({ d1: 'K', d2: 'N', d8: 'r', h8: 'k' });
    const moves = legalMoves(pinned, WHITE).filter((m) => m.from === sq('d2'));
    expect(moves).toHaveLength(0);
  });

  it('recognises fool’s mate as checkmate', () => {
    // 1. f3 e5 2. g4 Qh4#
    let g = game(board());
    const seq: Array<[string, string, number]> = [
      ['f2', 'f3', WHITE], ['e7', 'e5', BLACK],
      ['g2', 'g4', WHITE], ['d8', 'h4', BLACK],
    ];
    for (const [from, to, seat] of seq) {
      const r = chess.apply(g, seat, { from: sq(from), to: sq(to) });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      g = r.game;
    }
    expect(g.status).toBe('over');
    expect(g.winner).toBe(BLACK);
    expect(g.note.toLowerCase()).toContain('checkmate');
  });

  it('recognises stalemate as a draw', () => {
    // Black king a8, white queen c7, white king a6: black to move, no legal move.
    const b = position({ a8: 'k', c7: 'Q', a6: 'K' });
    expect(inCheck(b.squares, BLACK)).toBe(false);
    expect(legalMoves(b, BLACK)).toHaveLength(0);
  });

  it('reports a square attacked by a sliding piece', () => {
    const b = position({ a1: 'R', h8: 'k', e5: 'K' });
    expect(isAttacked(b.squares, sq('a8'), WHITE)).toBe(true);
    expect(isAttacked(b.squares, sq('b2'), WHITE)).toBe(false);
  });
});

describe('draws and rejections', () => {
  it('calls two lone kings insufficient material', () => {
    expect(insufficientMaterial(position({ e1: 'K', e8: 'k' }).squares)).toBe(true);
    expect(insufficientMaterial(position({ e1: 'K', e8: 'k', b1: 'N' }).squares)).toBe(true);
    expect(insufficientMaterial(position({ e1: 'K', e8: 'k', a1: 'R' }).squares)).toBe(false);
  });

  it('refuses to move a piece that is not yours', () => {
    const r = chess.apply(game(board()), WHITE, { from: sq('e7'), to: sq('e5') });
    expect(r).toMatchObject({ ok: false });
  });

  it('refuses an illegal destination', () => {
    const r = chess.apply(game(board()), WHITE, { from: sq('e2'), to: sq('e5') });
    expect(r).toMatchObject({ ok: false });
  });

  it('refuses a malformed move payload', () => {
    for (const move of [{}, { from: 'e2', to: 'e4' }, { from: -1, to: 5 }, { from: 12, to: 99 }]) {
      expect(chess.apply(game(board()), WHITE, move).ok).toBe(false);
    }
  });

  it('exposes itself through the registry', () => {
    expect(ENGINES.chess.minSeats).toBe(2);
    expect(ENGINES.chess.maxSeats).toBe(2);
  });
});
