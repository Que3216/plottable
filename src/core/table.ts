///<reference path="../reference.ts" />

module Plottable {

  interface IComponentPosition {
    component: Component;
    row: number;
    col: number;
  }
  interface LayoutIteration {
    xAllocations: number[];
    yAllocations: number[];
    unsatisfiedX: boolean[];
    unsatisfiedY: boolean[];

  }
  export class Table extends Component {
    private rowPadding = 0;
    private colPadding = 0;

    private rows: Component[][];
    private minimumHeights: number[];
    private minimumWidths: number[];

    private rowWeights: number[];
    private colWeights: number[];

    private nRows: number;
    private nCols: number;

    /**
     * Creates a Table.
     *
     * @constructor
     * @param {Component[][]} [rows] A 2-D array of the Components to place in the table.
     * null can be used if a cell is empty.
     */
    constructor(rows: Component[][] = []) {
      super();
      this.classed("table", true);
      this.rows = rows;
      this.nRows = rows.length;
      this.nCols = rows.length > 0 ? d3.max(rows, (r) => r.length) : 0;
      this.rowWeights = this.rows.map((): any => null);
      this.colWeights = d3.transpose(this.rows).map((): any => null);
    }

    /**
     * Adds a Component in the specified cell.
     *
     * @param {number} row The row in which to add the Component.
     * @param {number} col The column in which to add the Component.
     * @param {Component} component The Component to be added.
     */
    public addComponent(row: number, col: number, component: Component): Table {
      if (this.element != null) {
        throw new Error("addComponent cannot be called after anchoring (for the moment)");
      }

      this.nRows = Math.max(row + 1, this.nRows);
      this.nCols = Math.max(col + 1, this.nCols);
      this.padTableToSize(this.nRows, this.nCols);

      var currentComponent = this.rows[row][col];
      if (currentComponent != null) {
        throw new Error("addComponent cannot be called on a cell where a component already exists (for the moment)");
      }

      this.rows[row][col] = component;
      return this;
    }

    public _anchor(element: D3.Selection) {
      super._anchor(element);
      // recursively anchor children
      this.rows.forEach((row: Component[], rowIndex: number) => {
        row.forEach((component: Component, colIndex: number) => {
          if (component != null) {
            component._anchor(this.content);
          }
        });
      });
      return this;
    }

    private determineAllocations(xAllocations: number[], yAllocations: number[],
      xProportionalSpace: number[], yProportionalSpace: number[]
    ) {
      var xRequested = Utils.repeat(0, this.nCols);
      var yRequested = Utils.repeat(0, this.nRows);
      var layoutUnsatisfiedX = Utils.repeat(false, this.nCols);
      var layoutUnsatisfiedY = Utils.repeat(false, this.nRows);
      this.rows.forEach((row: Component[], rowIndex: number) => {
        row.forEach((component: Component, colIndex: number) => {
          var x = xAllocations[colIndex] + xProportionalSpace[colIndex];
          var y = yAllocations[rowIndex] + yProportionalSpace[rowIndex];
          var requestedXY = component != null ? component.requestedXY(x, y) : [0, 0];
          if (requestedXY[0] > x || requestedXY[1] > y) {
            throw new Error("Invariant Violation: Component cannot request more space than is offered");
          }
          xRequested[colIndex] = Math.max(xRequested[colIndex], requestedXY[0]);
          yRequested[rowIndex] = Math.max(yRequested[rowIndex], requestedXY[1]);
          var unsatisfiedX = component != null && component.isFixedWidth()  && requestedXY[0] === x;
          var unsatisfiedY = component != null && component.isFixedHeight() && requestedXY[1] === y;
          layoutUnsatisfiedX[colIndex] = layoutUnsatisfiedX[colIndex] || requestedXY[2];
          layoutUnsatisfiedY[rowIndex] = layoutUnsatisfiedY[rowIndex] || requestedXY[3];
        });
      });
      return {xAllocations: xRequested, yAllocations: yRequested, unsatisfiedX: layoutUnsatisfiedX, unsatisfiedY: layoutUnsatisfiedY}
    }

    public iterateLayout(availableX: number, availableY: number) {
      var cols = d3.transpose(this.rows);
      var rowWeights = Table.calcComponentWeights(this.rowWeights, this.rows, (c: Component) => (c == null) || c.isFixedHeight());
      var colWeights = Table.calcComponentWeights(this.colWeights,      cols, (c: Component) => (c == null) || c.isFixedWidth());

      var heuristicColWeights = colWeights.map((c) => c === 0 ? 0.5 : c);
      var heuristicRowWeights = rowWeights.map((c) => c === 0 ? 0.5 : c);

      var xProportionalSpace = Table.calcProportionalSpace(heuristicColWeights, availableX);
      var yProportionalSpace = Table.calcProportionalSpace(heuristicRowWeights, availableY);

      var xAllocations = Utils.repeat(0, this.nCols);
      var yAllocations = Utils.repeat(0, this.nRows);

      var freeX = availableX - d3.sum(xAllocations) - this.colPadding * (this.nCols - 1);
      var freeY = availableY - d3.sum(yAllocations) - this.rowPadding * (this.nRows - 1);
      var unsatisfiedX = true;
      var unsatisfiedY = true;
      var id = (x: boolean) => x;

      var nIterations = 0;
      while ((freeX > 1 && unsatisfiedX) || (freeY > 1 && unsatisfiedY)) {
        var layout = this.determineAllocations(xAllocations, yAllocations, xProportionalSpace, yProportionalSpace)
        xAllocations = layout.xAllocations;
        yAllocations = layout.yAllocations;
        var unsatisfiedXArr = layout.unsatisfiedX;
        var unsatisfiedYArr = layout.unsatisfiedY;
        unsatisfiedX = unsatisfiedXArr.some(id);
        unsatisfiedY = unsatisfiedYArr.some(id);

        freeX = availableX - d3.sum(xAllocations) - this.colPadding * (this.nCols - 1);
        freeY = availableY - d3.sum(yAllocations) - this.rowPadding * (this.nRows - 1);
        var xWeights: number[];
        var yWeights: number[];
        if (unsatisfiedX) {
          xWeights = unsatisfiedXArr.map((x) => x ? 1 : 0);
        } else {
          xWeights = colWeights;
        }

        if (unsatisfiedY) {
          yWeights = unsatisfiedYArr.map((x) => x ? 1 : 0);
        } else {
          yWeights = rowWeights;
        }

        xProportionalSpace = Table.calcProportionalSpace(xWeights, freeX);
        yProportionalSpace = Table.calcProportionalSpace(yWeights, freeY);
        nIterations++;

        if (nIterations > 10) {
          debugger;
          if (nIterations > 15) {
            break;
          }
        }
      }
      return [xProportionalSpace, yProportionalSpace, xAllocations, yAllocations, unsatisfiedX, unsatisfiedY];
    }

    public requestedXY(availableX: number, availableY: number): any[] {
      var layout: any[] = this.iterateLayout(availableX, availableY);
      var xAllocations: number[] = layout[2];
      var yAllocations: number[] = layout[3];
      var unsatisfiedX = layout[4];
      var unsatisfiedY = layout[5];
      return [d3.sum(xAllocations), d3.sum(yAllocations), unsatisfiedX, unsatisfiedY];
    }

    public _computeLayout(xOffset?: number, yOffset?: number, availableX?: number, availableY?: number) {
      super._computeLayout(xOffset, yOffset, availableX, availableY);
      var layout = this.iterateLayout(this.availableX, this.availableY);

      var xProportionalSpace = layout[0];
      var yProportionalSpace = layout[1];
      var xAllocations = layout[2];
      var yAllocations = layout[3];

      var sumPair = (p: number[]) => p[0] + p[1];
      var rowHeights = d3.zip(yProportionalSpace, yAllocations).map(sumPair);
      var colWidths  = d3.zip(xProportionalSpace, xAllocations).map(sumPair);
      var childYOffset = 0;
      this.rows.forEach((row: Component[], rowIndex: number) => {
        var childXOffset = 0;
        row.forEach((component: Component, colIndex: number) => {
          // recursively compute layout
          if (component != null) {
            component._computeLayout(childXOffset, childYOffset, colWidths[colIndex], rowHeights[rowIndex]);
          }
          childXOffset += colWidths[colIndex] + this.colPadding;
        });
        childYOffset += rowHeights[rowIndex] + this.rowPadding;
      });
      return this;
    }

    public _doRender() {
      // recursively render children
      this.rows.forEach((row: Component[], rowIndex: number) => {
        row.forEach((component: Component, colIndex: number) => {
          if (component != null) {
            component._doRender();
          }
        });
      });
      return this;
    }

    /**
     * Sets the row and column padding on the Table.
     *
     * @param {number} rowPadding The padding above and below each row, in pixels.
     * @param {number} colPadding the padding to the left and right of each column, in pixels.
     * @returns {Table} The calling Table.
     */
    public padding(rowPadding: number, colPadding: number) {
      this.rowPadding = rowPadding;
      this.colPadding = colPadding;
      return this;
    }

    /**
     * Sets the layout weight of a particular row.
     * Space is allocated to rows based on their weight. Rows with higher weights receive proportionally more space.
     *
     * @param {number} index The index of the row.
     * @param {number} weight The weight to be set on the row.
     * @returns {Table} The calling Table.
     */
    public rowWeight(index: number, weight: number) {
      this.rowWeights[index] = weight;
      return this;
    }

    /**
     * Sets the layout weight of a particular column.
     * Space is allocated to columns based on their weight. Columns with higher weights receive proportionally more space.
     *
     * @param {number} index The index of the column.
     * @param {number} weight The weight to be set on the column.
     * @returns {Table} The calling Table.
     */
    public colWeight(index: number, weight: number) {
      this.colWeights[index] = weight;
      return this;
    }

    public minimumHeight(): number;
    public minimumHeight(newVal: number): Table;
    public minimumHeight(newVal?: number): any {
      if (newVal != null) {
        throw new Error("minimumHeight cannot be directly set on Table");
      } else {
        this.minimumHeights = this.rows.map((row: Component[]) => d3.max(row, (r: Component) => (r == null) ? 0 : r.minimumHeight()));
        return d3.sum(this.minimumHeights) + this.rowPadding * (this.rows.length - 1);
      }
    }

    public minimumWidth(): number;
    public minimumWidth(newVal: number): Table;
    public minimumWidth(newVal?: number): any {
      if (newVal != null) {
        throw new Error("minimumWidth cannot be directly set on Table");
      } else {
        var cols = d3.transpose(this.rows);
        this.minimumWidths = cols.map((col: Component[]) => d3.max(col, (c: Component) => (c == null) ? 0 : c.minimumWidth()));
        return d3.sum(this.minimumWidths) + this.colPadding * (cols.length - 1);
      }
    }

    public isFixedWidth(): boolean {
      var cols = d3.transpose(this.rows);
      return Table.fixedSpace(cols, (c: Component) => (c == null) || c.isFixedWidth());
    }

    public isFixedHeight(): boolean {
      return Table.fixedSpace(this.rows, (c: Component) => (c == null) || c.isFixedHeight());
    }

    private padTableToSize(nRows: number, nCols: number) {
      for (var i = 0; i<nRows; i++) {
        if (this.rows[i] === undefined) {
          this.rows[i] = [];
          this.rowWeights[i] = null;
        }
        for (var j = 0; j<nCols; j++) {
          if (this.rows[i][j] === undefined) {
            this.rows[i][j] = null;
          }
        }
      }
      for (j = 0; j<nCols; j++) {
        if (this.colWeights[j] === undefined) {
          this.colWeights[j] = null;
        }
      }
    }

    private static calcComponentWeights(setWeights: number[],
                                        componentGroups: Component[][],
                                        fixityAccessor: (c: Component) => boolean) {
      // If the row/col weight was explicitly set, then return it outright
      // If the weight was not explicitly set, then guess it using the heuristic that if all components are fixed-space
      // then weight is 0, otherwise weight is 1
      return setWeights.map((w, i) => {
        if (w != null) {
          return w;
        }
        var fixities = componentGroups[i].map(fixityAccessor);
        var allFixed = fixities.reduce((a, b) => a && b);
        return allFixed ? 0 : 1;
      });
    }

    private static calcProportionalSpace(weights: number[], freeSpace: number): number[] {
      var weightSum = d3.sum(weights);
      if (weightSum === 0) {
        var numGroups = weights.length;
        return weights.map((w) => freeSpace / numGroups);
      } else {
        return weights.map((w) => freeSpace * w / weightSum);
      }
    }

    private static fixedSpace(componentGroup: Component[][], fixityAccessor: (c: Component) => boolean) {
      var all = (bools: boolean[]) => bools.reduce((a, b) => a && b);
      var groupIsFixed = (components: Component[]) => all(components.map(fixityAccessor));
      return all(componentGroup.map(groupIsFixed));
    }
  }
}
