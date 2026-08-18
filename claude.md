# Project

Circling is a visual art piece. It uses the P5 JS library to display a grid that slowly scrolls vertically, with a a random scattering of arcs animating in some of them (the arcs grown from one inside wall of their square until they reach an adjacent wall - then as they shrink from the tail end, a new arc grows from that shared wall in the adjacent square, giving the impression of a continuing curved line.) The scrolling should be achieved by including an extra row of squares at the bottom that's initially below the edge of the screen - when the display has scrolled far enough the top row should be moved to the bottom position to provide continuity. Similarly, arcs that reach the top or bottom edge should wrap to the other end of the display.

# Tooling

Node v22 is available, use @web/dev-server to provide live reloading of the display during development.
