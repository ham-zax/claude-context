"""Synthetic, provider-neutral relationship fixtures.

The names and shapes are intentionally unrelated to the frozen production
repository.  Comments identify the expected semantic distinction for the
qualification harness; they are not consumed by the query.
"""


def northbound(value):
    return "north", value


def southbound(value):
    return "south", value


class Courier:
    def __init__(self, callback):
        self.callback = callback

    def dispatch(self, value):
        return self.callback(value)


class Workshop:
    def __init__(self):
        # Two instances of the same class carry different callbacks.
        self.north_route = Courier(northbound)
        self.south_route = Courier(southbound)

    def send_both(self, value):
        self.north_route.dispatch(value)
        self.south_route.dispatch(value)


class ReassignmentCase:
    def run(self, value):
        courier = Courier(northbound)
        courier = Courier(southbound)
        return courier.dispatch(value)


class BranchConflictCase:
    def run(self, value, choose_north):
        if choose_north:
            courier = Courier(northbound)
        else:
            courier = Courier(southbound)
        return courier.dispatch(value)


class ExplicitOwner:
    def __init__(self):
        self.courier = Courier(northbound)

    def run(self, value):
        return self.courier.dispatch(value)


workshop = Workshop()
workshop.send_both(1)
ReassignmentCase().run(2)
BranchConflictCase().run(3, True)
ExplicitOwner().run(4)
