#!/usr/bin/env python3
"""One-shot migration from one MCU load to active and WFI branches."""

from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    path.write_text(source.replace(old, new, 1))


examples = Path("src/domain/examples.ts")
replace_once(
    examples,
    "    { id: 'r-mcu', kind: 'resistor', label: 'MCU ~45mA', x: 855, y: 260, properties: { resistance: 73.3 } },\n",
    "    { id: 's-mcu-active', kind: 'switch', label: 'CPU ACTIVE', x: 820, y: 105, properties: { closed: true, onResistance: 0.02, offResistance: 10e6 } },\n"
    "    { id: 'r-mcu-active', kind: 'resistor', label: 'MCU ~45mA', x: 870, y: 255, properties: { resistance: 73.3 } },\n"
    "    { id: 's-mcu-sleep', kind: 'switch', label: 'CPU WFI', x: 820, y: 410, properties: { closed: false, onResistance: 0.02, offResistance: 10e6 } },\n"
    "    { id: 'r-mcu-sleep', kind: 'resistor', label: 'MCU sleep ~0.1mA', x: 970, y: 410, properties: { resistance: 33_000 } },\n",
    "MCU components",
)
replace_once(
    examples,
    "    wire('ldo-mcu', 'r-ldo', 'b', 'r-mcu', 'a'),\n",
    "    wire('rail-mcu-active-switch', 'r-ldo', 'b', 's-mcu-active', 'a'),\n"
    "    wire('mcu-active-switch-load', 's-mcu-active', 'b', 'r-mcu-active', 'a'),\n"
    "    wire('rail-mcu-sleep-switch', 'r-ldo', 'b', 's-mcu-sleep', 'a'),\n"
    "    wire('mcu-sleep-switch-load', 's-mcu-sleep', 'b', 'r-mcu-sleep', 'a'),\n",
    "MCU rail wires",
)
replace_once(
    examples,
    "    wire('mcu-ground', 'r-mcu', 'b', 'g-wallet', 'gnd'),\n",
    "    wire('mcu-active-ground', 'r-mcu-active', 'b', 'g-wallet', 'gnd'),\n"
    "    wire('mcu-sleep-ground', 'r-mcu-sleep', 'b', 'g-wallet', 'gnd'),\n",
    "MCU ground wires",
)
replace_once(
    examples,
    "    description: 'USB cable drop, input/output decoupling, display load and an optional signing load in a first-order 3.3 V rail model.',\n",
    "    description: 'USB rail, decoupling, mutually exclusive Cortex-M active/WFI loads, display load and signing load in a first-order 3.3 V model.',\n",
    "example description",
)

main = Path("src/main.tsx")
replace_once(
    main,
    "  const displayClosed = booleanParameter('display', true);\n  const signingClosed = booleanParameter('signing', false);\n",
    "  const awake = booleanParameter('awake', true);\n"
    "  const displayClosed = booleanParameter('display', true);\n"
    "  const signingClosed = booleanParameter('signing', false);\n",
    "URL power parameter",
)
replace_once(
    main,
    "      if (component.id === 's-display') {\n",
    "      if (component.id === 's-mcu-active') {\n"
    "        return { ...component, properties: { ...component.properties, closed: awake } };\n"
    "      }\n"
    "      if (component.id === 's-mcu-sleep') {\n"
    "        return { ...component, properties: { ...component.properties, closed: !awake } };\n"
    "      }\n"
    "      if (component.id === 's-display') {\n",
    "power-state switch binding",
)

tests = Path("src/domain/examples.test.ts")
replace_once(
    tests,
    "    expect(byId.get('r-mcu')).toMatchObject({\n      kind: 'resistor',\n      properties: { resistance: 73.3 },\n    });\n",
    "    expect(byId.get('r-mcu-active')).toMatchObject({\n"
    "      kind: 'resistor',\n"
    "      properties: { resistance: 73.3 },\n"
    "    });\n"
    "    expect(byId.get('r-mcu-sleep')).toMatchObject({\n"
    "      kind: 'resistor',\n"
    "      properties: { resistance: 33_000 },\n"
    "    });\n"
    "    expect(byId.get('s-mcu-active')).toMatchObject({\n"
    "      kind: 'switch',\n"
    "      properties: { closed: true, offResistance: 10e6 },\n"
    "    });\n"
    "    expect(byId.get('s-mcu-sleep')).toMatchObject({\n"
    "      kind: 'switch',\n"
    "      properties: { closed: false, offResistance: 10e6 },\n"
    "    });\n",
    "power-state component test",
)
replace_once(
    tests,
    "    expect(endpoints).toContain('s-display.b->r-display.a');\n",
    "    expect(endpoints).toContain('s-mcu-active.b->r-mcu-active.a');\n"
    "    expect(endpoints).toContain('r-mcu-active.b->g-wallet.gnd');\n"
    "    expect(endpoints).toContain('s-mcu-sleep.b->r-mcu-sleep.a');\n"
    "    expect(endpoints).toContain('r-mcu-sleep.b->g-wallet.gnd');\n"
    "    expect(endpoints).toContain('s-display.b->r-display.a');\n",
    "power-state wiring test",
)
