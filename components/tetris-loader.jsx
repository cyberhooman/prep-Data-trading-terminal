/**
 * Tetris Loading Animation Component
 * Pure React JSX version - no TypeScript
 * Displays animated falling tetris pieces while AI analysis is in progress
 */

function TetrisLoader({
  size = 'sm',
  speed = 'fast',
  showLoadingText = true,
  loadingText = 'AI analyzing...'
}) {
  // Tetris pieces - pure black
  const TETRIS_PIECES = [
    { shape: [[1, 1, 1, 1]], color: '#000000' }, // I-piece
    { shape: [[1, 1], [1, 1]], color: '#000000' }, // O-piece
    { shape: [[0, 1, 0], [1, 1, 1]], color: '#000000' }, // T-piece
    { shape: [[1, 0], [1, 0], [1, 1]], color: '#000000' }, // L-piece
    { shape: [[0, 1, 1], [1, 1, 0]], color: '#000000' }, // S-piece
    { shape: [[1, 1, 0], [0, 1, 1]], color: '#000000' }, // Z-piece
    { shape: [[0, 1], [0, 1], [1, 1]], color: '#000000' }, // J-piece
  ];

  // Size configurations
  const sizeConfig = {
    sm: { cellSize: 8, gridWidth: 8, gridHeight: 12, padding: 2 },
    md: { cellSize: 12, gridWidth: 10, gridHeight: 16, padding: 4 },
    lg: { cellSize: 16, gridWidth: 10, gridHeight: 20, padding: 6 }
  };

  // Speed configurations (in milliseconds)
  const speedConfig = {
    slow: 150,
    normal: 80,
    fast: 40
  };

  const config = sizeConfig[size];
  const fallSpeed = speedConfig[speed];

  const [grid, setGrid] = React.useState(() =>
    Array(config.gridHeight).fill(null).map(() =>
      Array(config.gridWidth).fill(null).map(() => ({ filled: false, color: '' }))
    )
  );
  const [fallingPiece, setFallingPiece] = React.useState(null);
  const [isClearing, setIsClearing] = React.useState(false);

  // Rotate a shape 90 degrees clockwise
  const rotateShape = React.useCallback((shape) => {
    const rows = shape.length;
    const cols = shape[0].length;
    const rotated = Array(cols).fill(null).map(() => Array(rows).fill(0));

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        rotated[j][rows - 1 - i] = shape[i][j];
      }
    }

    return rotated;
  }, []);

  // Create a new random piece
  const createNewPiece = React.useCallback(() => {
    const pieceData = TETRIS_PIECES[Math.floor(Math.random() * TETRIS_PIECES.length)];
    let shape = pieceData.shape;

    // Random rotations
    const rotations = Math.floor(Math.random() * 4);
    for (let i = 0; i < rotations; i++) {
      shape = rotateShape(shape);
    }

    const maxX = config.gridWidth - shape[0].length;
    const x = Math.floor(Math.random() * (maxX + 1));

    return {
      shape,
      color: pieceData.color,
      x,
      y: -shape.length,
      id: Math.random().toString(36).substr(2, 9),
    };
  }, [rotateShape, config.gridWidth]);

  // Check if a piece can be placed at a position
  const canPlacePiece = React.useCallback((piece, newX, newY) => {
    for (let row = 0; row < piece.shape.length; row++) {
      for (let col = 0; col < piece.shape[row].length; col++) {
        if (piece.shape[row][col]) {
          const gridX = newX + col;
          const gridY = newY + row;

          if (gridX < 0 || gridX >= config.gridWidth || gridY >= config.gridHeight) {
            return false;
          }

          if (gridY >= 0 && grid[gridY][gridX].filled) {
            return false;
          }
        }
      }
    }
    return true;
  }, [grid, config.gridWidth, config.gridHeight]);

  // Place a piece on the grid
  const placePiece = React.useCallback((piece) => {
    setGrid(prevGrid => {
      const newGrid = prevGrid.map(row => row.map(cell => ({ ...cell })));

      for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
          if (piece.shape[row][col]) {
            const gridX = piece.x + col;
            const gridY = piece.y + row;

            if (gridY >= 0 && gridY < config.gridHeight && gridX >= 0 && gridX < config.gridWidth) {
              newGrid[gridY][gridX] = { filled: true, color: piece.color };
            }
          }
        }
      }

      return newGrid;
    });
  }, [config.gridHeight, config.gridWidth]);

  // Clear completed lines
  const clearFullLines = React.useCallback(() => {
    setGrid(prevGrid => {
      const linesToClear = [];

      prevGrid.forEach((row, index) => {
        if (row.every(cell => cell.filled)) {
          linesToClear.push(index);
        }
      });

      if (linesToClear.length > 0) {
        setIsClearing(true);

        setTimeout(() => {
          setGrid(currentGrid => {
            const filteredGrid = currentGrid.filter((_, index) => !linesToClear.includes(index));
            const emptyRows = Array(linesToClear.length).fill(null).map(() =>
              Array(config.gridWidth).fill(null).map(() => ({ filled: false, color: '' }))
            );
            setIsClearing(false);
            return [...emptyRows, ...filteredGrid];
          });
        }, 200);

        return prevGrid;
      }

      return prevGrid;
    });
  }, [config.gridWidth]);

  // Check if grid needs reset
  const checkAndReset = React.useCallback(() => {
    const topRows = grid.slice(0, 4);
    const needsReset = topRows.some(row => row.filter(cell => cell.filled).length > config.gridWidth * 0.7);

    if (needsReset) {
      setIsClearing(true);
      setTimeout(() => {
        setGrid(Array(config.gridHeight).fill(null).map(() =>
          Array(config.gridWidth).fill(null).map(() => ({ filled: false, color: '' }))
        ));
        setFallingPiece(null);
        setIsClearing(false);
      }, 500);
      return true;
    }
    return false;
  }, [grid, config.gridWidth, config.gridHeight]);

  // Game loop
  React.useEffect(() => {
    let lastUpdate = Date.now();
    let frameId;

    const gameLoop = () => {
      const now = Date.now();

      if (now - lastUpdate >= fallSpeed) {
        lastUpdate = now;

        if (!isClearing && !checkAndReset()) {
          setFallingPiece(prevPiece => {
            if (!prevPiece) {
              return createNewPiece();
            }

            const newY = prevPiece.y + 1;

            if (canPlacePiece(prevPiece, prevPiece.x, newY)) {
              return { ...prevPiece, y: newY };
            } else {
              placePiece(prevPiece);
              setTimeout(clearFullLines, 50);
              return createNewPiece();
            }
          });
        }
      }

      frameId = requestAnimationFrame(gameLoop);
    };

    frameId = requestAnimationFrame(gameLoop);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [canPlacePiece, createNewPiece, placePiece, clearFullLines, checkAndReset, isClearing, fallSpeed]);

  // Render the grid
  const renderGrid = () => {
    const displayGrid = grid.map(row => row.map(cell => ({ ...cell })));

    // Add falling piece to display
    if (fallingPiece && !isClearing) {
      for (let row = 0; row < fallingPiece.shape.length; row++) {
        for (let col = 0; col < fallingPiece.shape[row].length; col++) {
          if (fallingPiece.shape[row][col]) {
            const gridX = fallingPiece.x + col;
            const gridY = fallingPiece.y + row;

            if (gridY >= 0 && gridY < config.gridHeight && gridX >= 0 && gridX < config.gridWidth) {
              displayGrid[gridY][gridX] = { filled: true, color: fallingPiece.color };
            }
          }
        }
      }
    }

    return displayGrid.map((row, rowIndex) => (
      React.createElement('div', {
        key: rowIndex,
        style: { display: 'flex' }
      },
        row.map((cell, colIndex) => (
          React.createElement('div', {
            key: `${rowIndex}-${colIndex}`,
            style: {
              width: `${config.cellSize}px`,
              height: `${config.cellSize}px`,
              border: '1px solid #ddd',
              backgroundColor: cell.filled ? cell.color : '#f9f9f9',
              transform: cell.filled ? 'scale(1)' : 'scale(0.95)',
              transition: 'all 0.1s',
              opacity: isClearing && rowIndex < 4 ? 0.5 : 1
            }
          })
        ))
      )
    ));
  };

  return React.createElement('div', {
    style: {
      display: 'inline-block',
      textAlign: 'center'
    }
  },
    React.createElement('div', {
      style: {
        marginBottom: '12px'
      }
    },
      React.createElement('div', {
        style: {
          border: '2px solid #333',
          backgroundColor: '#fff',
          padding: `${config.padding}px`,
          display: 'inline-block'
        }
      },
        renderGrid()
      )
    ),
    showLoadingText && React.createElement('div', {
      style: {
        textAlign: 'center'
      }
    },
      React.createElement('p', {
        style: {
          color: 'var(--text, #333)',
          fontWeight: '500',
          margin: '0',
          fontSize: '14px'
        }
      }, loadingText)
    )
  );
}
