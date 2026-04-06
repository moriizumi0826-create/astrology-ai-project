try:
    from natal_loader import load_csv_dicts
except ModuleNotFoundError:
    from scripts.natal_loader import load_csv_dicts


def load_transit_support_data(aspects_file, houses_file) -> dict:
    aspect_rows = load_csv_dicts(aspects_file)
    house_rows = load_csv_dicts(houses_file)

    aspect_map = {}
    for row in aspect_rows:
        pair = (row["天体1"], row["天体2"])
        reverse_pair = (row["天体2"], row["天体1"])
        aspect_map[pair] = row
        aspect_map[reverse_pair] = row

    house_map = {str(row["ハウス番号"]): row for row in house_rows}

    return {
        "aspects": aspect_rows,
        "houses": house_rows,
        "aspect_map": aspect_map,
        "house_map": house_map,
    }
