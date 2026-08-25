import { describe, expect, test } from 'bun:test';
import { definitionOf } from '../domain/components';
import { cloneExample } from '../domain/examples';
import { autoLayoutCircuit } from './autoLayout';

function box(component: ReturnType<typeof cloneExample>['components'][number]) {
  const definition = definitionOf(component);
  return {
    left: component.x,
    right: component.x + definition.width,
    top: component.y,
    bottom: component.y + definition.height,
  };
}

describe('automatic circuit layout', () => {
  test('keeps topology and values while moving only coordinates', () => {
    const original = cloneExample('reserve-power');
    const arranged = autoLayoutCircuit(original);

    expect(arranged.wires).toEqual(original.wires);
    const withoutPosition = ({
      id,
      kind,
      label,
      properties,
    }: (typeof original.components)[number]) => ({ id, kind, label, properties });
    expect(arranged.components.map(withoutPosition)).toEqual(
      original.components.map(withoutPosition),
    );
    expect(
      arranged.components.some((component, index) => {
        const before = original.components[index]!;
        return component.x !== before.x || component.y !== before.y;
      }),
    ).toBe(true);
  });

  test('places sources left, branches apart, and ground on the right', () => {
    const arranged = autoLayoutCircuit(cloneExample('rc-divider'));
    const source = arranged.components.find((component) => component.kind === 'voltageSource')!;
    const ground = arranged.components.find((component) => component.kind === 'ground')!;
    const nonGround = arranged.components.filter((component) => component.kind !== 'ground');

    expect(source.x).toBe(Math.min(...nonGround.map((component) => component.x)));
    expect(ground.x).toBeGreaterThan(Math.max(...nonGround.map((component) => component.x)));

    for (let leftIndex = 0; leftIndex < arranged.components.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < arranged.components.length; rightIndex += 1) {
        const left = box(arranged.components[leftIndex]!);
        const right = box(arranged.components[rightIndex]!);
        const separated =
          left.right + 24 <= right.left ||
          right.right + 24 <= left.left ||
          left.bottom + 24 <= right.top ||
          right.bottom + 24 <= left.top;
        expect(separated).toBe(true);
      }
    }
  });

  test('is deterministic', () => {
    const document = cloneExample('diode-clamp');
    expect(autoLayoutCircuit(document)).toEqual(autoLayoutCircuit(document));
  });
});
