import type { ApplyResult, Board, ChessBoard, Game, GameEngine, Move } from './types';
import { intField } from './types';

/**
 * A complete chess rules engine: castling, en passant, promotion, check,
 * checkmate, stalemate, the fifty-move rule and insufficient material.
 *
 * Board indices run 0 = a8 through 63 = h1, i.e. the order a board is printed
 * in. Seat 0 is white, seat 1 is black.
 *
 * Move generation is deliberately two-stage — pseudo-legal moves first, then a
 * filter that plays each one and discards any leaving your own king attacked.
 * It is not the fastest approach, but it is the one that cannot silently get
 * pins, discovered checks or castling-through-check wrong, and a chat game
 * never needs the speed.
 */

export const WHITE = 0;
export const BLACK = 1;

const row = (i: number) => i >> 3;
const col = (i: number) => i & 7;
const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const sq = (r: number, c: number) => r * 8 + c;

export function colourOf(piece: string | null): number | null {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? WHITE : BLACK;
}

const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';

export function startingSquares(): (string | null)[] {
  return START.split('').map((c) => (c === '.' ? null : c));
}

/* ------------------------------------------------------ pseudo-legal moves */

const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * Targets a piece attacks or can move to, ignoring whether the move would
 * leave its own king in check. Castling and the pawn's forward push are not
 * attacks, so they are added by the caller rather than here.
 */
function pseudoTargets(
  squares: (string | null)[],
  from: number,
  enPassant: number | null,
  attacksOnly: boolean
): number[] {
  const piece = squares[from];
  if (!piece) return [];
  const me = colourOf(piece);
  const type = piece.toLowerCase();
  const r = row(from);
  const c = col(from);
  const out: number[] = [];

  const push = (r2: number, c2: number): boolean => {
    if (!onBoard(r2, c2)) return false;
    const target = squares[sq(r2, c2)];
    if (target && colourOf(target) === me) return false;
    out.push(sq(r2, c2));
    return !target; // keep sliding only through empty squares
  };

  if (type === 'p') {
    // White moves toward rank 8, which is a *decreasing* row index here.
    const dir = me === WHITE ? -1 : 1;
    // Captures (and the squares a pawn attacks).
    for (const dc of [-1, 1]) {
      const r2 = r + dir;
      const c2 = c + dc;
      if (!onBoard(r2, c2)) continue;
      const target = squares[sq(r2, c2)];
      if (attacksOnly) out.push(sq(r2, c2));
      else if (target && colourOf(target) !== me) out.push(sq(r2, c2));
      else if (enPassant !== null && sq(r2, c2) === enPassant) out.push(enPassant);
    }
    if (!attacksOnly) {
      const one = sq(r + dir, c);
      if (onBoard(r + dir, c) && !squares[one]) {
        out.push(one);
        const startRow = me === WHITE ? 6 : 1;
        const two = sq(r + 2 * dir, c);
        if (r === startRow && !squares[two]) out.push(two);
      }
    }
    return out;
  }

  if (type === 'n') {
    for (const [dr, dc] of KNIGHT_DELTAS) push(r + dr, c + dc);
    return out;
  }

  if (type === 'k') {
    for (const [dr, dc] of KING_DELTAS) push(r + dr, c + dc);
    return out;
  }

  const dirs =
    type === 'b' ? BISHOP_DIRS : type === 'r' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
  for (const [dr, dc] of dirs) {
    let r2 = r + dr;
    let c2 = c + dc;
    while (push(r2, c2)) {
      r2 += dr;
      c2 += dc;
    }
  }
  return out;
}

/** Is `target` attacked by any piece of `byColour`? */
export function isAttacked(
  squares: (string | null)[],
  target: number,
  byColour: number
): boolean {
  for (let i = 0; i < 64; i++) {
    const piece = squares[i];
    if (!piece || colourOf(piece) !== byColour) continue;
    if (pseudoTargets(squares, i, null, true).includes(target)) return true;
  }
  return false;
}

export function findKing(squares: (string | null)[], colour: number): number {
  const king = colour === WHITE ? 'K' : 'k';
  return squares.indexOf(king);
}

export function inCheck(squares: (string | null)[], colour: number): boolean {
  const king = findKing(squares, colour);
  if (king === -1) return false;
  return isAttacked(squares, king, 1 - colour);
}

/* --------------------------------------------------------------- applying */

export interface ChessMove {
  from: number;
  to: number;
  promo?: string;
}

interface Applied {
  squares: (string | null)[];
  castling: string;
  enPassant: number | null;
  halfmove: number;
  capture: boolean;
}

/** Applies a move that is already known to be pseudo-legal. */
function applyRaw(board: ChessBoard, mv: ChessMove, colour: number): Applied {
  const squares = board.squares.slice();
  const piece = squares[mv.from]!;
  const type = piece.toLowerCase();
  let capture = squares[mv.to] !== null;

  squares[mv.to] = piece;
  squares[mv.from] = null;

  // En passant removes a pawn that is not on the destination square.
  if (type === 'p' && board.enPassant !== null && mv.to === board.enPassant) {
    const dir = colour === WHITE ? 1 : -1;
    squares[mv.to + dir * 8] = null;
    capture = true;
  }

  // Promotion. Anything other than q/r/b/n is treated as a queen.
  if (type === 'p' && (row(mv.to) === 0 || row(mv.to) === 7)) {
    const want = (mv.promo ?? 'q').toLowerCase();
    const promo = ['q', 'r', 'b', 'n'].includes(want) ? want : 'q';
    squares[mv.to] = colour === WHITE ? promo.toUpperCase() : promo;
  }

  // Castling moves the rook too. The king's two-square step identifies it.
  if (type === 'k' && Math.abs(col(mv.to) - col(mv.from)) === 2) {
    const r = row(mv.from);
    const kingSide = col(mv.to) === 6;
    const rookFrom = sq(r, kingSide ? 7 : 0);
    const rookTo = sq(r, kingSide ? 5 : 3);
    squares[rookTo] = squares[rookFrom];
    squares[rookFrom] = null;
  }

  // Castling rights die when a king or rook leaves its home square, and also
  // when a rook is captured on its home square.
  let castling = board.castling;
  const drop = (chars: string) => {
    for (const ch of chars) castling = castling.replace(ch, '');
  };
  if (type === 'k') drop(colour === WHITE ? 'KQ' : 'kq');
  if (mv.from === 63 || mv.to === 63) drop('K');
  if (mv.from === 56 || mv.to === 56) drop('Q');
  if (mv.from === 7 || mv.to === 7) drop('k');
  if (mv.from === 0 || mv.to === 0) drop('q');
  if (castling === '') castling = '-';

  // A double pawn push sets the square that can be captured through.
  let enPassant: number | null = null;
  if (type === 'p' && Math.abs(row(mv.to) - row(mv.from)) === 2) {
    enPassant = (mv.from + mv.to) / 2;
  }

  const halfmove = type === 'p' || capture ? 0 : board.halfmove + 1;
  return { squares, castling, enPassant, halfmove, capture };
}

/** Every fully legal move for `colour`. */
export function legalMoves(board: ChessBoard, colour: number): ChessMove[] {
  const out: ChessMove[] = [];

  for (let from = 0; from < 64; from++) {
    const piece = board.squares[from];
    if (!piece || colourOf(piece) !== colour) continue;

    for (const to of pseudoTargets(board.squares, from, board.enPassant, false)) {
      const mv: ChessMove = { from, to };
      const next = applyRaw(board, mv, colour);
      if (inCheck(next.squares, colour)) continue;
      out.push(mv);
    }
  }

  // Castling: king and rook unmoved, squares between them empty, and the king
  // neither in check nor passing through an attacked square.
  const homeRow = colour === WHITE ? 7 : 0;
  const kingSq = sq(homeRow, 4);
  const rights = colour === WHITE ? ['K', 'Q'] : ['k', 'q'];
  if (board.squares[kingSq]?.toLowerCase() === 'k' && !inCheck(board.squares, colour)) {
    for (const right of rights) {
      if (!board.castling.includes(right)) continue;
      const kingSide = right.toLowerCase() === 'k';
      const rookSq = sq(homeRow, kingSide ? 7 : 0);
      if (board.squares[rookSq]?.toLowerCase() !== 'r') continue;

      const between = kingSide ? [5, 6] : [1, 2, 3];
      if (between.some((c) => board.squares[sq(homeRow, c)] !== null)) continue;

      // The king may not start in, pass through, or land on an attacked square.
      const path = kingSide ? [4, 5, 6] : [4, 3, 2];
      if (path.some((c) => isAttacked(board.squares, sq(homeRow, c), 1 - colour))) continue;

      out.push({ from: kingSq, to: sq(homeRow, kingSide ? 6 : 2) });
    }
  }

  return out;
}

/**
 * Two lone kings, or a king and a single minor piece, can never mate. Calling
 * those a draw stops a finished game sitting "active" forever.
 */
export function insufficientMaterial(squares: (string | null)[]): boolean {
  const pieces = squares.filter(Boolean).map((p) => p!.toLowerCase());
  if (pieces.some((p) => p === 'p' || p === 'r' || p === 'q')) return false;
  const minors = pieces.filter((p) => p === 'b' || p === 'n').length;
  return minors <= 1;
}

const NAMES: Record<string, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
};

export function squareName(i: number): string {
  return 'abcdefgh'[col(i)] + (8 - row(i));
}

export const chess: GameEngine = {
  kind: 'chess',
  label: 'Chess',
  blurb: 'Full rules — castling, en passant, promotion, the lot.',
  icon: '♟️',
  minSeats: 2,
  maxSeats: 2,

  createBoard(): Board {
    return {
      kind: 'chess',
      squares: startingSquares(),
      castling: 'KQkq',
      enPassant: null,
      halfmove: 0,
      check: false,
      lastMove: null,
    };
  },

  apply(game: Game, seat: number, move: Move): ApplyResult {
    if (game.board.kind !== 'chess') return { ok: false, error: 'Wrong board' };
    const board = game.board;

    const from = intField(move, 'from', 0, 63);
    const to = intField(move, 'to', 0, 63);
    if (from === null || to === null) return { ok: false, error: 'Pick a square to move from and to' };

    const piece = board.squares[from];
    if (!piece) return { ok: false, error: 'No piece there' };
    if (colourOf(piece) !== seat) return { ok: false, error: 'That is not your piece' };

    const promoRaw = move.promo;
    const promo = typeof promoRaw === 'string' ? promoRaw.toLowerCase() : undefined;

    const legal = legalMoves(board, seat);
    if (!legal.some((m) => m.from === from && m.to === to)) {
      return {
        ok: false,
        error: inCheck(board.squares, seat) ? 'You must get out of check' : 'Illegal move',
      };
    }

    const applied = applyRaw(board, { from, to, promo }, seat);
    const opponent = 1 - seat;
    const opponentBoard: ChessBoard = {
      kind: 'chess',
      squares: applied.squares,
      castling: applied.castling,
      enPassant: applied.enPassant,
      halfmove: applied.halfmove,
      check: inCheck(applied.squares, opponent),
      lastMove: [from, to],
    };

    const replies = legalMoves(opponentBoard, opponent);
    const name = game.players[seat]?.name ?? 'Someone';
    const label = NAMES[piece.toLowerCase()] ?? 'Piece';
    const notation = `${label} ${squareName(from)}→${squareName(to)}`;

    let status: Game['status'] = 'active';
    let winner: number | null = null;
    let note = `${name}: ${notation}`;

    if (replies.length === 0) {
      status = 'over';
      if (opponentBoard.check) {
        winner = seat;
        note = `${name} wins by checkmate — ${notation}`;
      } else {
        note = `Stalemate after ${notation} — draw`;
      }
    } else if (applied.halfmove >= 100) {
      status = 'over';
      note = 'Draw by the fifty-move rule';
    } else if (insufficientMaterial(applied.squares)) {
      status = 'over';
      note = 'Draw — insufficient material';
    } else if (opponentBoard.check) {
      note = `${name}: ${notation} — check`;
    }

    return {
      ok: true,
      game: {
        ...game,
        board: opponentBoard,
        turn: status === 'over' ? game.turn : opponent,
        status,
        winner,
        note,
      },
    };
  },
};
