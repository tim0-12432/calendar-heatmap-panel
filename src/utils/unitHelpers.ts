import { getValueFormat } from '@grafana/data';

export function formatValue(value: number, unit: string): string {
    if (!unit || unit === 'none') {
        return value.toString();
    }
    const formatter = getValueFormat(unit);
    const formattedValue = formatter(value);
    return `${formattedValue.prefix ?? ''}${formattedValue.text}${formattedValue.suffix ?? ''}`;
}
