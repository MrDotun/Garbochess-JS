var g_startOffset = null;
var g_selectedPiece = null;
var moveNumber = 1;

var g_allMoves = [];
var g_playerWhite = true;
var g_changingFen = false;
var g_analyzing = false;

var g_uiBoard;
var g_cellSize = 45;

// Added for click-to-move and highlight tracking
var g_selectedSquare = null;

function UINewGame() {
    moveNumber = 1;

    var pgnTextBox = document.getElementById("PgnTextBox");
    pgnTextBox.value = "";

    EnsureAnalysisStopped();
    ResetGame();
    if (InitializeBackgroundEngine()) {
        g_backgroundEngine.postMessage("go");
    }
    g_allMoves = [];
    RedrawBoard();

    if (!g_playerWhite) {
        SearchAndRedraw();
    }
}

function EnsureAnalysisStopped() {
    if (g_analyzing && g_backgroundEngine != null) {
        g_backgroundEngine.terminate();
        g_backgroundEngine = null;
    }
}

function UIAnalyzeToggle() {
    if (InitializeBackgroundEngine()) {
        if (!g_analyzing) {
            g_backgroundEngine.postMessage("analyze");
        } else {
            EnsureAnalysisStopped();
        }
        g_analyzing = !g_analyzing;
        document.getElementById("AnalysisToggleLink").innerText = g_analyzing ? "Analysis: On" : "Analysis: Off";
    } else {
        alert("Your browser must support web workers for analysis - (chrome4, ff4, safari)");
    }
}

function UIChangeFEN() {
    if (!g_changingFen) {
        var fenTextBox = document.getElementById("FenTextBox");
        var result = InitializeFromFen(fenTextBox.value);
        if (result.length != 0) {
            UpdatePVDisplay(result);
            return;
        } else {
            UpdatePVDisplay('');
        }
        g_allMoves = [];

        EnsureAnalysisStopped();
        InitializeBackgroundEngine();

        g_playerWhite = !!g_toMove;
        g_backgroundEngine.postMessage("position " + GetFen());

        RedrawBoard();
    }
}

function UIChangeStartPlayer() {
    g_playerWhite = !g_playerWhite;
    RedrawBoard();
}

function UpdatePgnTextBox(move) {
    var pgnTextBox = document.getElementById("PgnTextBox");
    if (g_toMove != 0) {
        pgnTextBox.value += moveNumber + ". ";
        moveNumber++;
    }
    pgnTextBox.value += GetMoveSAN(move) + " ";
}

function UIChangeTimePerMove() {
    var timePerMove = document.getElementById("TimePerMove");
    g_timeout = parseInt(timePerMove.value, 10);
}

function FinishMove(bestMove, value, timeTaken, ply) {
    if (bestMove != null) {
        UIPlayMove(bestMove, BuildPVMessage(bestMove, value, timeTaken, ply));
    } else {
        CheckGameEnd();
    }
}

// Added function to announce game end state
function CheckGameEnd() {
    var moves = GenerateValidMoves();
    if (moves.length === 0) {
        if (g_inCheck) {
            alert("Checkmate! Game Over.");
        } else {
            alert("Stalemate! Game is a draw.");
        }
        return true;
    }
    return false;
}

function UIPlayMove(move, pv) {
    UpdatePgnTextBox(move);

    g_allMoves[g_allMoves.length] = move;
    MakeMove(move);

    UpdatePVDisplay(pv);
    UpdateFromMove(move);
    
    // Check for checkmate after AI move
    setTimeout(CheckGameEnd, 100);
}

function UIUndoMove() {
  if (g_allMoves.length == 0) {
    return;
  }

  if (g_backgroundEngine != null) {
    g_backgroundEngine.terminate();
    g_backgroundEngine = null;
  }

  UnmakeMove(g_allMoves[g_allMoves.length - 1]);
  g_allMoves.pop();

  if (g_playerWhite != !!g_toMove && g_allMoves.length != 0) {
    UnmakeMove(g_allMoves[g_allMoves.length - 1]);
    g_allMoves.pop();
  }

  RedrawBoard();
}

function UpdatePVDisplay(pv) {
    if (pv != null) {
        var outputDiv = document.getElementById("output");
        if (outputDiv.firstChild != null) {
            outputDiv.removeChild(outputDiv.firstChild);
        }
        outputDiv.appendChild(document.createTextNode(pv));
    }
}

function SearchAndRedraw() {
    if (g_analyzing) {
        EnsureAnalysisStopped();
        InitializeBackgroundEngine();
        g_backgroundEngine.postMessage("position " + GetFen());
        g_backgroundEngine.postMessage("analyze");
        return;
    }

    if (InitializeBackgroundEngine()) {
        g_backgroundEngine.postMessage("search " + g_timeout);
    } else {
	Search(FinishMove, 99, null);
    }
}

var g_backgroundEngineValid = true;
var g_backgroundEngine;

function InitializeBackgroundEngine() {
    if (!g_backgroundEngineValid) {
        return false;
    }

    if (g_backgroundEngine == null) {
        g_backgroundEngineValid = true;
        try {
            g_backgroundEngine = new Worker("js/garbochess.js");
            g_backgroundEngine.onmessage = function (e) {
                if (e.data.match("^pv") == "pv") {
                    UpdatePVDisplay(e.data.substr(3, e.data.length - 3));
                } else if (e.data.match("^message") == "message") {
                    EnsureAnalysisStopped();
                    UpdatePVDisplay(e.data.substr(8, e.data.length - 8));
                } else {
                    UIPlayMove(GetMoveFromString(e.data), null);
                }
            }
            g_backgroundEngine.error = function (e) {
                alert("Error from background worker:" + e.message);
            }
            g_backgroundEngine.postMessage("position " + GetFen());
        } catch (error) {
            g_backgroundEngineValid = false;
        }
    }

    return g_backgroundEngineValid;
}

function UpdateFromMove(move) {
    var fromX = (move & 0xF) - 4;
    var fromY = ((move >> 4) & 0xF) - 2;
    var toX = ((move >> 8) & 0xF) - 4;
    var toY = ((move >> 12) & 0xF) - 2;

    if (!g_playerWhite) {
        fromY = 7 - fromY;
        toY = 7 - toY;
        fromX = 7 - fromX;
        toX = 7 - toX;
    }

    if ((move & moveflagCastleKing) ||
        (move & moveflagCastleQueen) ||
        (move & moveflagEPC) ||
        (move & moveflagPromotion)) {
        RedrawPieces();
    } else {
        var fromSquare = g_uiBoard[fromY * 8 + fromX];
        $(g_uiBoard[toY * 8 + toX])
            .empty()
            .append($(fromSquare).children());
    }
}

function RedrawPieces() {
    for (y = 0; y < 8; ++y) {
        for (x = 0; x < 8; ++x) {
            var td = g_uiBoard[y * 8 + x];
            var pieceY = g_playerWhite ? y : 7 - y;
            var pieceX = g_playerWhite ? x : 7 - x;
            var piece = g_board[((pieceY + 2) * 0x10) + pieceX + 4];
            var pieceName = null;
            switch (piece & 0x7) {
                case piecePawn: pieceName = "pawn"; break;
                case pieceKnight: pieceName = "knight"; break;
                case pieceBishop: pieceName = "bishop"; break;
                case pieceRook: pieceName = "rook"; break;
                case pieceQueen: pieceName = "queen"; break;
                case pieceKing: pieceName = "king"; break;
            }
            if (pieceName != null) {
                pieceName += "_";
                pieceName += (piece & 0x8) ? "white" : "black";
            }

            if (pieceName != null) {
                var img = document.createElement("div");
                $(img).addClass('sprite-' + pieceName);
                img.style.backgroundImage = "url('img/sprites.png')";
                img.width = g_cellSize;
                img.height = g_cellSize;
                var divimg = document.createElement("div");
                divimg.appendChild(img);

                // Structures for click-to-move interaction are handled in RedrawBoard
                $(td).empty().append(divimg);
            } else {
                $(td).empty();
            }
        }
    }
}

function RedrawBoard() {
    var div = $("#board")[0];

    var table = document.createElement("table");
    table.cellPadding = "0px";
    table.cellSpacing = "0px";
    $(table).addClass('no-highlight');

    var tbody = document.createElement("tbody");

    g_uiBoard = [];
    g_selectedSquare = null;

    var onSquareClick = function(x, y) {
        if (g_selectedSquare === null) {
            // First click: Selection
            var boardX = g_playerWhite ? x : 7 - x;
            var boardY = g_playerWhite ? y : 7 - y;
            var piece = g_board[((boardY + 2) * 0x10) + boardX + 4];

            if (piece !== 0) { 
                g_selectedSquare = { x: x, y: y };
                // Highlight selection square
                g_uiBoard[y * 8 + x].style.backgroundColor = "#7b917b";
            }
        } else {
            // Second click: Execute Move
            var startX = g_selectedSquare.x;
            var startY = g_selectedSquare.y;
            
            // Restore original square color
            g_uiBoard[startY * 8 + startX].style.backgroundColor = ((startY ^ startX) & 1) ? "#D18947" : "#FFCE9E";

            var logicStartX = g_playerWhite ? startX : 7 - startX;
            var logicStartY = g_playerWhite ? startY : 7 - startY;
            var logicEndX = g_playerWhite ? x : 7 - x;
            var logicEndY = g_playerWhite ? y : 7 - y;

            var moves = GenerateValidMoves();
            var move = null;
            for (var i = 0; i < moves.length; i++) {
                if ((moves[i] & 0xFF) == MakeSquare(logicStartY, logicStartX) &&
                    ((moves[i] >> 8) & 0xFF) == MakeSquare(logicEndY, logicEndX)) {
                    move = moves[i];
                    break;
                }
            }

            if (!(startX === x && startY === y)) {
                if (move != null) {
                    UpdatePgnTextBox(move);
                    if (InitializeBackgroundEngine()) {
                        g_backgroundEngine.postMessage(FormatMove(move));
                    }
                    g_allMoves[g_allMoves.length] = move;
                    MakeMove(move);
                    UpdateFromMove(move);
                    
                    document.getElementById("FenTextBox").value = GetFen();
                    
                    if (!CheckGameEnd()) {
                        setTimeout("SearchAndRedraw()", 100);
                    }
                } else {
                    alert("Illegal move!");
                }
            }
            g_selectedSquare = null;
        }
    };

    for (var y = 0; y < 8; ++y) {
        var tr = document.createElement("tr");
        for (var x = 0; x < 8; ++x) {
            var td = document.createElement("td");
            td.style.width = g_cellSize + "px";
            td.style.height = g_cellSize + "px";
            td.style.backgroundColor = ((y ^ x) & 1) ? "#D18947" : "#FFCE9E";
            
            (function(currX, currY, cell) {
                $(cell).click(function() { onSquareClick(currX, currY); });
            })(x, y, td);

            tr.appendChild(td);
            g_uiBoard[y * 8 + x] = td;
        }
        tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    RedrawPieces();

    $(div).empty();
    div.appendChild(table);

    g_changingFen = true;
    document.getElementById("FenTextBox").value = GetFen();
    g_changingFen = false;
}
