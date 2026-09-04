def paginate(items: list, page: int, limit: int) -> dict:
    total = len(items)
    start = (page - 1) * limit
    end = start + limit

    return {
        "count": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "items": items[start:end],
    }