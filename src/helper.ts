export function isValidString(str: string | undefined | null): boolean {
    return str !== undefined && str !== null && str.trim().length > 0;
}

export function isValidMap(map: Map<any, any> | undefined | null): boolean {
    return map !== undefined && map !== null && map.size > 0;
}
