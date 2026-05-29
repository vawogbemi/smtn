export const calculateShipping = (value: {
    packages: {
        quantity: number
        weight: number
        height: number
        width: number
        length: number
    }[],
    barrels: {
        small: number
        large: number
    },
    description: {
        description: string
    }
    devices: {
        phones: number
        consoles: number
        laptops: number
        tablets: number
    }
    trip: {
        from: string
        to: string
        method: string
        type: string
    }
}) => {

    const totalWeight = value.packages.reduce((acc, cur) => {
        return acc + cur.quantity * (Math.max(cur.weight, (cur.height * cur.width * cur.length) / 366))
    }, 0)

    if (totalWeight > 10) { return totalWeight * 900 }
    else return (totalWeight * 1500)+ (value.devices.phones * 3000) + (value.devices.consoles * 10000) + (value.devices.laptops * 6000) + (value.devices.tablets * 4000 )
}